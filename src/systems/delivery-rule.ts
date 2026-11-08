import type { Hop, RouteStop, RunMapState } from '@/types/map';
import type { DeliveryForecast } from '@/types/repo';
import { hopBetween, reachableFrom } from '@systems/map-hop';
import { solLy, distTable } from '@systems/map-geometry';
import { armShipAt, isEndSlot, worldSlotOf } from '@systems/map-streams';

// The delivery rule (02-map §3.9, §8.3; slice-3b-plan §1.1 item 6, §4.2), pure, on galaxy years and whole LY (02 §3.1: the
// kid can redo every sum on screen). A file requested when leaving S0 for S1 goes S0 → SOL → S1 at light speed (the request
// to ARRIVAL CONTROL, the file back):
// • detour = |S0−SOL| + |SOL−S1| − |S0−S1|: the years it trails the unit's own beam;
// • lateness(S1) = detour − slack(S1): ≤ 0 means it is waiting in S1's receiver when the unit approaches;
// • otherwise S1's receiver forwards it along the unit's route, and at each next ship lateness = previous − that hop's slack;
// • the year it reaches a receiver is that ship's approach + its lateness there (at S1 this is A(S0) + |S0−SOL| + |SOL−S1|).
// Messages ride direct light from their source instead (lightArrival; plan §2.4, risk 8): a reply has no destination to
// forward from. Every function here is store-free: the REPOSITORY's ETAs, the card's DELIVERIES row and TIMELINE, the
// PACKET's chips and the INBOX's stamps all read it. The foundation wrote it real (both tracks need true numbers); Track
// REPO owns it after.

// The years a file requested on the hop from → to trails the unit's own beam.
export function detourYears(map: Readonly<RunMapState>, from: number, to: number): number {
  const a = worldSlotOf(map, from);
  const b = worldSlotOf(map, to);
  return solLy(a) + solLy(b) - distTable(a, b);
}

// Its lateness at the hop's destination: detour − slack (≤ 0: in time, waiting in the receiver).
export function firstLateness(map: Readonly<RunMapState>, from: number, to: number): number {
  return detourYears(map, from, to) - hopBetween(map, from, to).slackYears;
}

// The year it reaches the destination's receiver: A(from) + |from−SOL| + |SOL−to|.
export function arrivedYear(map: Readonly<RunMapState>, from: number, to: number): number {
  return hopBetween(map, from, to).leaveYear + solLy(worldSlotOf(map, from)) + solLy(worldSlotOf(map, to));
}

// Its lateness one ship further: the receiver it trails into forwards it along the unit's next hop, which leaves the
// unit `slackYears` early (lateness(S2) = lateness(S1) − slack(S2), 02 §3.9).
export function forwardLateness(lateness: number, hop: Readonly<Pick<Hop, 'slackYears'>>): number {
  return lateness - hop.slackYears;
}

// The year a file `lateness` years behind the unit reaches the receiver of a ship approaching in `approachYear` (the boot's
// `(arrived 2659)`, the TIMELINE's mark): a negative lateness is how early it waits there.
export function receiverYear(approachYear: number, lateness: number): number {
  return approachYear + lateness;
}

// What the REPOSITORY says of a request on the hop from → to, the destination at `toDepth` of the unit's run (default: the
// next ship from the route's current one):
// • in time at the destination;
// • late, with the first depth where any route from the destination catches it up (a breadth-first walk over reachable
//   hops, layer by layer: `SHIP d AT THE EARLIEST`; the kid's actual route decides whether it does);
// • never: the destination is a final ship (no ship after it to forward to), or no route catches it before one.
// It judges the timing only; the recommendation (systems/repository.ts) judges need only (02 §3.8).
export function deliveryForecast(map: Readonly<RunMapState>, from: number, to: number, toDepth: number = map.route.length + 1): DeliveryForecast {
  const lateness = firstLateness(map, from, to);
  const arrived = arrivedYear(map, from, to);
  const approachYear = hopBetween(map, from, to).approachYear;
  if (lateness <= 0 && !receiverClosed(map, to)) return { kind: 'in-time', arrivedYear: arrived, approachYear };
  const earliest = earliestCatchUp(map, to, lateness, toDepth);
  if (earliest === null) return { kind: 'never', arrivedYear: arrived, approachYear, yearsLate: lateness };
  return { kind: 'late', arrivedYear: arrived, approachYear, yearsLate: lateness, earliestDepth: earliest };
}

// A receiver that will not hold a delivery (slice 5's RECEIVER CLOSED on a resident's ship, plan risk 14): nothing catches
// up there (it is not a stop a file can wait at), though a file may still be forwarded past it. The one seam: the
// forecast's walk and systems/repository.ts hopOutlook both read it. Slice 5 decided (slice-5-plan R10, [FRAN]): every
// receiver stays open. A closed one would turn the desk's ETA into NEVER on the sleeper's and the late surprise's ships and
// spoil both on the map; the boot's bypass opens the receiver, for the unit and for what follows it.
export function receiverClosed(map: Readonly<RunMapState>, slot: number): boolean {
  void map;
  void slot;
  return false;
}

// The first depth past `depth` at which some route from `slot` (reached at `depth`) brings a file `lateness` years behind
// to zero or less, or null: the forecast's `SHIP d AT THE EARLIEST`, and systems/repository.ts's late-or-never verdict for a
// request still in transit. Each layer keeps the least lateness per slot (a later route to the same ship with more
// lateness can never do better from there). A final ship ends a route: nothing forwards from it.
export function earliestCatchUp(map: Readonly<RunMapState>, slot: number, lateness: number, depth: number): number | null {
  let frontier = new Map<number, number>([[slot, lateness]]);
  for (let d = depth; frontier.size > 0; d++) {
    const next = new Map<number, number>();
    for (const [at, behind] of frontier) {
      if (isEndSlot(map, at)) continue;
      for (const to of reachableFrom(map, at)) {
        const left = forwardLateness(behind, hopBetween(map, at, to));
        if (left <= 0 && !receiverClosed(map, to)) return d + 1;
        const best = next.get(to);
        if (best === undefined || left < best) next.set(to, left);
      }
    }
    frontier = next;
  }
  return null;
}

// A message's source: ARRIVAL CONTROL at SOL, or a world on the arm (a colony, 046's trail), by world slot.
export type LightSource = { kind: 'sol' } | { kind: 'world'; worldSlot: number };

// Where a message sent from `source` in `sentYear` is read (05 §3.3's postcard rule, plan §2.4): at the first stop of
// `route` deeper than `afterDepth` whose approach year is at or after the light's arrival there (T + |P − X|); RECEIVED is
// that arrival. null: no stop of `route` yet (a later one may still take it). The route's first stop approaches in the
// run's start year (map.startYear); every later stop in its hop's approach year.
export function lightArrival(
  map: Readonly<RunMapState>, source: Readonly<LightSource>, sentYear: number, route: readonly RouteStop[], afterDepth: number,
): { depth: number; receivedYear: number } | null {
  for (const stop of route) {
    if (stop.depth <= afterDepth) continue;
    const world = worldSlotOf(map, stop.slot);
    const travel = source.kind === 'sol' ? solLy(world) : distTable(source.worldSlot, world);
    const receivedYear = sentYear + travel;
    if (stopApproachYear(map, stop) >= receivedYear) return { depth: stop.depth, receivedYear };
  }
  return null;
}

// A route stop's approach year (the galaxy year while the unit is there).
function stopApproachYear(map: Readonly<RunMapState>, stop: Readonly<RouteStop>): number {
  if (stop.hop !== null) return stop.hop.approachYear;
  return armShipAt(map, stop.slot).approachYear;
}
