// Slice 8 Step 0 (slice-8-plan R5): the four routes the balance kids fly on run 1's arm with PT_ROUTES=set, picked from run 1's
// arm with the map's own reachability and pinned here. Run 1's reachability is the same on every arm seed (its table fixes
// the slots, years and kinds: the same 907 routes on seeds 1, 3, 99 and 200), so one check covers them.
// • worked: 02 §3.14's worked route (HALCYON, KESTREL, VESPER, CORMORANT; 55 pods).
// • r5: the worked route without HALCYON, 5 ships (README's tension: HOLLOW compressed into fewer ships, KESTREL at depth 2).
// • r8: 8 ships, one per layer, through as much of the worked route as an 8-ship route keeps (HALCYON, KESTREL, CORMORANT),
//   the sleeper on CURLEW, PLOVER and the late corrupted resident on PROVIDENCE.
// • tight: the worked route with its layer-7 ship the TIGHT WAYFARER instead of CORMORANT (HOLLOW boards one hop from the
//   final ship, so it boards a TIGHT ship: the squeeze).
// Pure data (no game import), so balance/targets.test reads it in its second; balance/route-check.ts assertRouteSet throws
// when a route stops being one of the arm's.

export type RouteName = 'worked' | 'r5' | 'r8' | 'tight';

export const ROUTE_SET: Readonly<Record<RouteName, readonly number[]>> = {
  worked: [0, 2, 5, 11, 15, 19],
  r5: [0, 5, 11, 15, 19],
  r8: [0, 2, 5, 7, 10, 15, 16, 19],
  tight: [0, 2, 5, 11, 18, 19],
};

export const ROUTE_NAMES: readonly RouteName[] = ['worked', 'r5', 'r8', 'tight'];

// The route's name in the set, or null for any other route.
export function routeName(route: readonly number[]): RouteName | null {
  return ROUTE_NAMES.find((name) => ROUTE_SET[name].join(',') === route.join(',')) ?? null;
}
