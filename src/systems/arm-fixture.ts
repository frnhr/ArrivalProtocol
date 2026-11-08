// Run 1's authored ships on the worked route (Track RETIRE, slice-4cde-plan §9.2): where a headless world or `__ap.ship(n)`
// puts the unit when it names a ship by number, now that the classic five are retired. Ship n is the n-th of run 1's five
// authored ships (ARES-VII, HALCYON, KESTREL, VESPER, LAST LIGHT; data/run1-arm.ts), reached along 02 §3.14's worked
// route [0, 2, 5, 11, 15, 19]: VESPER → LAST LIGHT is 83 LY, out of range, so LAST LIGHT is reached through CORMORANT and
// is depth 6, not 5. The route's stops carry their real hops (systems/map-hop.ts hopBetween), and the threat a ship is built
// with is the nominal route's (TRACE 0, no DEAL: map-facts nominalRouteThreat), so HOLLOW boards at CORMORANT, the
// stop one hop from New Haven (M3), as on any real run 1. Pure.
import type { RunMapState, RouteStop } from '@/types/map';
import type { RunThreatState, ShipThreat } from '@/types/threat';
import { hopBetween } from '@systems/map-hop';
import { mapFacts, nominalRouteThreat } from '@systems/map-facts';
import { planThreat, threatInputFor, createRunThreat, NO_FINAL_TRACES } from '@systems/threat-plan';

// 02 §3.14's worked route: ARES-VII, HALCYON, KESTREL, VESPER, CORMORANT, LAST LIGHT.
export const WORKED_ROUTE: readonly number[] = [0, 2, 5, 11, 15, 19];
// Run 1's five authored ships by number (data/run1-arm.ts RUN1_ROWS' `authored`): ship n is in slot AUTHORED_SLOTS[n].
export const AUTHORED_SLOTS: readonly number[] = [0, 2, 5, 11, 19];

// The worked route's stops up to and including `slot` (first ship first). Throws on a slot the route does not visit.
export function workedRouteTo(slot: number): number[] {
  const at = WORKED_ROUTE.indexOf(slot);
  if (at < 0) throw new Error(`workedRouteTo: slot ${slot} is not on the worked route (${WORKED_ROUTE.join(', ')})`);
  return WORKED_ROUTE.slice(0, at + 1);
}

// The authored ship `index`'s slot (0 ARES-VII … 4 LAST LIGHT).
export function authoredSlot(index: number): number {
  const slot = AUTHORED_SLOTS[index];
  if (slot === undefined) throw new Error(`authoredSlot: no authored ship ${index} (have ${AUTHORED_SLOTS.length})`);
  return slot;
}

// `map` (on its first ship) with the unit on the last of `slots`, every stop with its real hop and the galaxy year its
// approach. `slots` starts at the map's first ship.
export function mapAlong(map: Readonly<RunMapState>, slots: readonly number[]): RunMapState {
  if (slots.length === 0 || slots[0] !== map.route[0]?.slot) throw new Error(`mapAlong: a route from the map's first ship (got [${slots.join(', ')}])`);
  const route: RouteStop[] = slots.map((slot, i) => ({ slot, depth: i + 1, hop: i === 0 ? null : hopBetween(map, slots[i - 1]!, slot) }));
  const next = structuredClone(map) as RunMapState;
  next.route = route;
  next.galaxyYear = route.at(-1)!.hop?.approachYear ?? map.startYear;
  next.pendingExtra = null;
  return next;
}

// The run's threat before the last of `slots` (the nominal route's up to the stop before it), and the verdict for it on that
// route: what a ship built straight onto the route starts with (createInitialState, __ap.ship).
export function nominalAlong(map: Readonly<RunMapState>, slots: readonly number[]): { before: RunThreatState; verdict: ShipThreat } {
  if (slots.length === 1) {
    const before = createRunThreat();
    const facts = { depth: 1, isFinal: false, oneHopFromFinal: false, beamSeeds: { kind: 'none' as const } };
    return { before, verdict: planThreat(threatInputFor(before, facts, false, NO_FINAL_TRACES)) };
  }
  const before = nominalRouteThreat(map, slots.slice(0, -1));
  const facts = mapFacts(map, slots[slots.length - 2]!, slots[slots.length - 1]!, slots.length);
  return { before, verdict: planThreat(threatInputFor(before, facts, false, NO_FINAL_TRACES)) };
}
