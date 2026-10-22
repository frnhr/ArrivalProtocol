// WP3 headless harness: the WP2 harness (store, clock, orbit-sim, predictor, pace, input router,
// say, boot, flight events, director, mode keys) plus the DOM-free ops core. Tests drive the
// real actions (state/actions.ts) and fs-tools' rules exactly as a click would.
// One harness per test file (systems are module singletons); resetTo() between scenarios.
import { createHarness2, type Harness2 } from '../wp2/harness2';
import { mountOpsCore, getOps } from '@systems/ops-core';
import { mountHeldToolSync } from '@systems/fs-tools';
import { on } from '@systems/events';
import { installTool } from '@systems/licences';
import { getByRole, hasIntegrity } from '@state/selectors';
import type { Segment, RedundancySegment } from '@/types/segment';
import type { GameState } from '@state/schema';
import type { Store } from '@state/store';

// WP4 changed the seed: only SCAN is installed at the start (the other tools are licences) and
// Engine I/O arrives at 85% (the ship-1 fault drops it to 38% mid-burn). The WP3 suites were
// written for the old strip, with every tool present and Engine I/O at 38%, so the harness
// recreates exactly that through the real licence installs and the fault's integrity.
export function wp3Fixture(store: Store<GameState>): void {
  for (const kind of ['repair', 'move', 'copy', 'delete'] as const) installTool(store, kind);
  const engine = getByRole(store.getState(), 'engine-io');
  if (!engine || !hasIntegrity(engine)) throw new Error('wp3Fixture: no Engine I/O');
  store.update((d) => {
    engine.integrity = 38;
    engine.state = 'corrupt';
    d.ui.memoryRev++;
  });
}

export interface Harness3 extends Harness2 {
  // Every tool refusal ('refused' with tool: true) since the last resetTo, in order.
  refusals: string[];
  // Steps until no op runs (or maxWall passes); returns the wall seconds it took.
  runOps: (maxWall?: number) => number;
  // A segment by its on-screen name (tests only: game code looks segments up by role or type).
  seg: (name: string) => Segment;
  charge: () => RedundancySegment;
  layout: () => string;
}

export function createHarness3(seed = 1): Harness3 {
  const base = createHarness2(seed);
  mountOpsCore(base.store);
  mountHeldToolSync(base.store);
  const refusals: string[] = [];
  on('refused', ({ reason, tool }) => { if (tool) refusals.push(reason); });
  wp3Fixture(base.store);
  const harness: Harness3 = {
    ...base,
    refusals,
    resetTo(phase, nextSeed) {
      base.resetTo(phase, nextSeed);
      wp3Fixture(base.store);
      refusals.length = 0;
    },
    runOps(maxWall = 60) {
      const start = base.wall();
      while (getOps().length > 0 && base.wall() - start < maxWall) base.step();
      return base.wall() - start;
    },
    seg(name) {
      const found = base.store.getState().memory.find((seg) => seg.name === name);
      if (!found) throw new Error(`harness3: no segment named '${name}'`);
      return found;
    },
    charge() {
      const found = base.store.getState().memory.find((seg): seg is RedundancySegment => seg.type === 'redundancy');
      if (!found) throw new Error('harness3: REPAIR CHARGE is gone');
      return found;
    },
    layout: () => layoutOf(base.store.getState()),
  };
  return harness;
}

// The strip as text: id:type:size@address for every segment (exact-restore comparisons).
export function layoutOf(state: Readonly<GameState>): string {
  let addr = 0;
  return state.memory.map((seg) => {
    const entry = `${seg.id}:${seg.type}:${seg.size}@${addr}`;
    addr += seg.size;
    return entry;
  }).join(' ');
}
