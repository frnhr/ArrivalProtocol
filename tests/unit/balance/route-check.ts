// Slice 8 Step 0 (slice-8-plan R5): balance/routes.ts's four routes are routes of run 1's arm (map-route.ts routes: each slot
// reachable from the one before, ending at a final ship), the worked one is arm-fixture's, and r5 and r8 fly 5 and 8 ships.
// Throws otherwise, so PT_ROUTES=set never flies a route the desk would refuse.
import { routes } from '@systems/map-route';
import { WORKED_ROUTE } from '@systems/arm-fixture';
import { run1Map } from '../map/run1-fixture';
import { ROUTE_SET, ROUTE_NAMES } from './routes';

export function assertRouteSet(seed = 7): void {
  const all = new Set(routes(run1Map(seed)).map((route) => route.join(',')));
  for (const name of ROUTE_NAMES) {
    const route = ROUTE_SET[name];
    if (!all.has(route.join(','))) throw new Error(`balance/routes: the ${name} route ${route.join(',')} is not a route of run 1's arm (seed ${seed})`);
  }
  if (ROUTE_SET.worked.join(',') !== WORKED_ROUTE.join(',')) throw new Error(`balance/routes: the worked route is ${WORKED_ROUTE.join(',')}`);
  if (ROUTE_SET.r5.length !== 5 || ROUTE_SET.r8.length !== 8) throw new Error('balance/routes: r5 must fly 5 ships and r8 8');
}
