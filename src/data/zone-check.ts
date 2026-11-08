// Slice 5 (Track KIN, a lead patch requested: see slice-5-plan.md "Deviations (Track KIN)"): the zone checks data/ships.ts
// runs at load, moved out of systems/zones.ts unchanged. data/ships.ts imported systems/zones for them, and that system's
// imports (state/actions → systems/residents → the residents' modules) put every resident module inside data/ships.ts's own
// load: a resident module that reached the classic five's data (retired since, Track RETIRE) then ran its load-time checks
// before data/ships.ts had run. Pure: no system imports.
import type { ShipFlightDef } from '@data/ships';
import type { ZoneDef } from '@/types/zone';
import type { MemoryLayout } from '@/types/map';
import { stateFromElements, inboundAnomalyAtRadius, type Vec2 } from '@/types/orbit';

// The point on the ship's arrival hyperbola at radius `radius`, on the way in (the path a kid who never
// touches the throttle flies: data/mission.ts createFlight places the ship on the same conic).
export function inboundPoint(flight: Readonly<ShipFlightDef>, radius: number): Vec2 {
  const { start, planet } = flight;
  const ecc = 1 + (start.rp0 * start.vInf * start.vInf) / planet.mu;
  const nu = inboundAnomalyAtRadius(start.rp0, ecc, radius);
  if (nu === null) throw new Error(`zones: the arrival path never reaches r ${radius} km`);
  const state = stateFromElements(start.rp0, ecc, start.omega0, nu, planet.mu);
  return { x: state.x, y: state.y };
}

// Throws on zone data that could not work: an unknown rack, a cloud off the arrival path or touching the
// planet, a belt inside the planet, two zones with one id. Runs for every ship at load (ships.ts).
export function validateZoneDefs(
  shipId: string, defs: readonly ZoneDef[], flight: Readonly<ShipFlightDef>, layout: Readonly<MemoryLayout>,
): void {
  const fail = (why: string): never => { throw new Error(`ShipDef ${shipId} zones: ${why}`); };
  const ids = new Set<string>();
  // A zone may only name a rack the ship's memory class has (a COMPACT ship has no rack D).
  const rackKnown = (rack: string): boolean => (layout.racks as readonly string[]).includes(rack);
  for (const def of defs) {
    if (ids.has(def.id)) fail(`duplicate zone id '${def.id}'`);
    ids.add(def.id);
    if (def.kind === 'debris') {
      if (!(def.r > 0)) fail(`${def.id}: r must be positive (got ${def.r})`);
      const at = def.centre.onInboundAtR;
      if (!(at > flight.start.rp0 && at < flight.start.r0)) fail(`${def.id}: the centre must be on the way in, between rp0 and r0 (got r ${at})`);
      if (at - def.r <= flight.planet.rAtm) fail(`${def.id}: the cloud reaches into the atmosphere`);
      if (!rackKnown(def.rack)) fail(`${def.id}: unknown rack '${def.rack}'`);
      if (def.laterRacks.length === 0) fail(`${def.id}: laterRacks is empty (a later run draws its rack from it)`);
      for (const rack of def.laterRacks) if (!rackKnown(rack)) fail(`${def.id}: unknown later rack '${rack}'`);
      inboundPoint(flight, at);
    } else {
      if (!(def.rIn > flight.planet.rAtm && def.rOut > def.rIn)) fail(`${def.id}: the belt must lie above the atmosphere with rOut > rIn`);
      if (def.racks.length === 0) fail(`${def.id}: a belt hits at least one rack`);
      for (const rack of def.racks) if (!rackKnown(rack)) fail(`${def.id}: unknown rack '${rack}'`);
    }
  }
}
