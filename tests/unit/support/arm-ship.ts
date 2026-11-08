// Track RETIRE (slice-4cde-plan §9.2): run 1's authored ships alone, as the suites fly them. A ship of the fixture world
// (state/initial.ts: authored ship n on the worked route, a fresh unit carried in by `carried: 'fresh'`) holds only what a
// fresh unit holds. On the classic five a ship alone also had its schedule's licences (systems/licences.ts: the tools of
// every ship before it, issued at its start); the arm's tools come by request (slice 3b), so the kit is what 02 §3.14's
// requests along the worked route have delivered by then (map/run1-route pins each delivery): MOVE at HALCYON, DELETE at
// KESTREL, SWAP at CORMORANT (4 years late for VESPER), COPY at LAST LIGHT.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { FsToolKind } from '@/types/fs-tool';
import { currentSlot } from '@systems/map-run';
import { giveTools } from '../map/repo-fixture';

export const WORKED_KIT: Readonly<Record<number, readonly FsToolKind[]>> = {
  0: [], 2: ['move'], 5: ['move', 'delete'], 11: ['move', 'delete'], 15: ['move', 'delete', 'swap'], 19: ['move', 'delete', 'swap', 'copy'],
};

// The tools the worked route has delivered by the ship the unit is on, written into memory and licensed (repo-fixture
// giveTools). Throws off the worked route, or on the classic five (its licences are the schedule's).
export function giveWorkedKit(store: Store<GameState>): void {
  const state = store.getState();
  if (state.run.map.world !== 'arm') throw new Error('giveWorkedKit: the classic five license their own tools');
  const kit = WORKED_KIT[currentSlot(state.run)];
  if (kit === undefined) throw new Error(`giveWorkedKit: slot ${currentSlot(state.run)} is not on the worked route`);
  giveTools(store, kit);
}
