// Track RETIRE (slice-4cde-plan §9.2): run 1's authored ships alone, as the suites fly them. A ship of the fixture world
// (state/initial.ts: authored ship n on the worked route, a fresh unit carried in by `carried: 'fresh'`) holds only what a
// fresh unit holds. On the retired classic five a ship alone also had its schedule's licences (phase 2's: the tools of
// every ship before it, issued at its start); the arm's tools come by request (slice 3b), so the kit is what 02 §3.14's
// requests along the worked route have delivered by then (map/run1-route pins each delivery): MOVE at HALCYON, DELETE at
// KESTREL, SWAP at CORMORANT (4 years late for VESPER), COPY at LAST LIGHT.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { FsToolKind } from '@/types/fs-tool';
import type { ShipDef } from '@data/ships';
import type { CarriedRacks } from '@data/memory';
import type { Hop } from '@/types/map';
import { currentSlot, currentShip, createRunMap } from '@systems/map-run';
import { mapAlong, nominalAlong, workedRouteTo, authoredSlot } from '@systems/arm-fixture';
import { freshUnitRacks } from '@systems/carry';
import type { ShipThreat } from '@/types/threat';
import { mapFacts, nominalRouteThreat } from '@systems/map-facts';
import { planThreat, threatInputFor, NO_FINAL_TRACES } from '@systems/threat-plan';
import { createInitialState } from '@state/initial';
import { giveTools } from '../map/repo-fixture';

export const WORKED_KIT: Readonly<Record<number, readonly FsToolKind[]>> = {
  0: [], 2: ['move'], 5: ['move', 'delete'], 11: ['move', 'delete'], 15: ['move', 'delete', 'swap'], 19: ['move', 'delete', 'swap', 'copy'],
};

// The tools the worked route has delivered by the ship the unit is on, written into memory and licensed (repo-fixture
// giveTools). Throws off the worked route.
export function giveWorkedKit(store: Store<GameState>): void {
  const state = store.getState();
  const kit = WORKED_KIT[currentSlot(state.run)];
  if (kit === undefined) throw new Error(`giveWorkedKit: slot ${currentSlot(state.run)} is not on the worked route`);
  giveTools(store, kit);
}

// Run 1's authored ship `index` (0 ARES-VII … 4 LAST LIGHT) as the fixture world builds it: its ShipDef (state/initial.ts,
// the worked route; the details rolled from `seed`, which is the arm seed there).
export function fixtureShip(index: number, seed = 1): ShipDef {
  return currentShip(createInitialState({ seed, shipIndex: index, carried: index === 0 ? null : 'fresh' }));
}

// A fresh unit's racks as the fixture world carries them into authored ship `index` (createInitialState's `carried:
// 'fresh'`): packed for the worked route's hop into it and laid out for its nominal verdict, on `ship` (the fixture's
// ShipDef unless given: a suite's own variant of it, phase 2's FULL geometry for one).
export function fixtureFreshRacks(index: number, ship: ShipDef = fixtureShip(index), seed = 1): CarriedRacks {
  const slots = workedRouteTo(authoredSlot(index));
  const map = mapAlong(createRunMap({ wave: 1 }, seed), slots);
  const hop = map.route.at(-1)!.hop;
  if (hop === null) throw new Error('fixtureFreshRacks: ship 1 meets a fresh unit by itself');
  return freshUnitRacks(ship, nominalAlong(map, slots).verdict);
}

// The verdict HOLLOW's forced boarding gives authored ship `index` on the worked route (as `__ap.board` makes it: the ship
// treated as one hop from a final ship, M3, on the nominal route's threat): phase 2's VESPER played this (ARRIVAL with WALLS
// folded in, a 10-block root); run 1's arm forces the boarding at CORMORANT instead, so a suite that means "the ship HOLLOW
// boards" builds it here.
export function fixtureBoardedVerdict(index: number, seed = 1): ShipThreat {
  const slots = workedRouteTo(authoredSlot(index));
  if (slots.length < 2) throw new Error('fixtureBoardedVerdict: ship 1 is never boarded');
  const map = mapAlong(createRunMap({ wave: 1 }, seed), slots);
  const before = nominalRouteThreat(map, slots.slice(0, -1));
  const facts = { ...mapFacts(map, slots[slots.length - 2]!, slots[slots.length - 1]!, slots.length), oneHopFromFinal: true };
  return planThreat(threatInputFor({ ...before, aboard: false, age: 0 }, facts, false, NO_FINAL_TRACES));
}

// The worked route's hop into authored ship `index` (its link, hits, years and room), on run 1's arm rolled from `seed`.
export function fixtureHop(index: number, seed = 1): Hop {
  const slots = workedRouteTo(authoredSlot(index));
  const hop = mapAlong(createRunMap({ wave: 1 }, seed), slots).route.at(-1)!.hop;
  if (hop === null) throw new Error('fixtureHop: ship 1 meets a fresh unit by itself (no hop)');
  return hop;
}

// The nominal verdict for authored ship `index` on the worked route (TRACE 0, no DEAL: what createInitialState builds it
// with).
export function fixtureVerdict(index: number, seed = 1): ShipThreat {
  const slots = workedRouteTo(authoredSlot(index));
  return nominalAlong(mapAlong(createRunMap({ wave: 1 }, seed), slots), slots).verdict;
}
