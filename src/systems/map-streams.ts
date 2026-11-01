import type { RunState } from '@state/schema';
import type { ArmShip, RouteStop, RunMapState, ShipKey } from '@/types/map';
import type { Rng } from '@systems/rng';
import { childRng, createRng, hashSeed } from '@systems/rng';
import { END_SLOTS } from '@data/arm';
import { CLASSIC_WORLD_SLOTS, CLASSIC_FINAL_INDEX } from '@data/classic-slots';

// Where the unit is on its map, which arm world a slot is, and which random stream a roll draws from (phase 3 slice 3a,
// slice-3a-plan §2.2, §2.5, risk 9). A leaf module (no ship data imported), so the systems that roll per visit (zones,
// HOLLOW, the landing, the ghost thrust, the draft) can use it from anywhere in the import graph; systems/map-run.ts
// re-exports it with the ShipDef lookups. Each function switches on run.map.world once; the classic world keeps today's `(seed, index, stream)`.
// Track GEN owns this file after the foundation.

export function currentStop(run: Readonly<Pick<RunState, 'map' | 'shipIndex'>>): RouteStop {
  const stop = run.map.route[run.shipIndex];
  if (!stop || run.map.route.length !== run.shipIndex + 1) {
    throw new Error(`currentStop: ship index ${run.shipIndex} on a route of ${run.map.route.length} (the route ends at the current ship)`);
  }
  return stop;
}

// On the classic world the slot IS the index (a suite that sets run.shipIndex by hand moves the ship with it, as before);
// on the arm it is the route's last stop. Code that may run on either world switches on `world` before currentStop.
export function currentSlot(run: Readonly<Pick<RunState, 'map' | 'shipIndex'>>): number {
  return run.map.world === 'classic' ? run.shipIndex : currentStop(run).slot;
}

// The arm world a slot sits on (review follow-up B2): the slot itself on the arm; on the classic world the five's own
// worlds (CLASSIC_WORLD_SLOTS: w0, w2, w5, w11, w19), since a classic slot is the ship's index, not a world id. Every
// geometry call (distances, layers, SOL distances, rings) takes a world slot: convert first.
export function worldSlotOf(map: Readonly<Pick<RunMapState, 'world'>>, slot: number): number {
  if (map.world === 'arm') return slot;
  const world = CLASSIC_WORLD_SLOTS[slot];
  if (world === undefined) throw new Error(`worldSlotOf: no classic ship ${slot}`);
  return world;
}

// Is `slot` a final ship's (review follow-up M4)? An end slot on the arm; the classic world's LAST LIGHT.
export function isEndSlot(map: Readonly<Pick<RunMapState, 'world'>>, slot: number): boolean {
  return map.world === 'classic' ? slot === CLASSIC_FINAL_INDEX : END_SLOTS.includes(slot);
}

// The arm ship in `slot` (fail loudly: a slot the arm does not have is a bug, never a quiet classic ship).
export function armShipAt(map: Readonly<RunMapState>, slot: number): ArmShip {
  const ship = map.arm[slot];
  if (map.world !== 'arm' || !ship || ship.slot !== slot) throw new Error(`armShipAt: no arm ship in slot ${slot} (world ${map.world})`);
  return ship;
}

// An arm ship's id (review follow-up M5): its ShipKey, so two runs or two rolls never share one, and shipDefOf can cache
// on it (data/arm.ts ARM_CONTENT_VERSION versions the worlds it is placed against).
export function armShipId(key: Readonly<ShipKey>): string {
  return `${key.armSeed >>> 0}:${key.reportedRun}:${key.slot}:${key.attempt}`;
}

// --- Random streams (02 §3.4; slice-3a-plan §2.5, risk 9) --------------------------------------------------------------

// An arm ship's rng key.
export function shipKeyOf(map: Readonly<RunMapState>, slot: number): ShipKey {
  const ship = armShipAt(map, slot);
  return { armSeed: map.armSeed, reportedRun: ship.reportedRun, slot, attempt: ship.attempt };
}

// The stream of one roll OF a ship keyed by its ShipKey (families, hurt drivers, zones, the flight's start; the
// generator's template, modifiers and landing): the same whatever route led there, and the same next run (3c).
export function keyRng(key: Readonly<ShipKey>, stream: string): Rng {
  return createRng(hashSeed(`ship:${key.armSeed >>> 0}:${key.reportedRun}:${key.slot}:${key.attempt}:${stream}`));
}

// A roll OF the ship in `slot`: its ShipKey's stream on the arm; the classic world keeps `(seed, index, stream)`.
export function shipRng(run: Readonly<Pick<RunState, 'seed' | 'map'>>, slot: number, stream: string): Rng {
  if (run.map.world === 'classic') return childRng(run.seed, slot, stream);
  return keyRng(shipKeyOf(run.map, slot), stream);
}

// A roll of THIS visit to the current ship (the landing's drop, the colony's name, HOLLOW's bites and verbs, the ghost
// thrust, the belt, the draft dealt as it is left): the run seed and the slot, so two runs of the same arm differ.
export function visitRng(run: Readonly<Pick<RunState, 'seed' | 'map' | 'shipIndex'>>, stream: string): Rng {
  return childRng(run.seed, currentSlot(run), stream);
}

// The run's noise clouds (02 §3.3: rolled fresh every run): a namespace of its own (`noise-clouds:`), so it can never
// collide with a per-ship or per-visit `childRng(seed, slot, stream)` key.
export function noiseRng(runSeed: number): Rng {
  return createRng(hashSeed(`noise-clouds:${runSeed >>> 0}`));
}

// A roll of one beam (the transit hits, the beam's seeds): keyed by both ends on the arm (`childRng(seed, to, stream:from)`,
// 02 §3.4), so two hops into one ship roll differently; the classic world keeps `(seed, index, stream)`.
export function hopRng(run: Readonly<Pick<RunState, 'seed' | 'map'>>, from: number, to: number, stream: string): Rng {
  if (run.map.world === 'classic') return childRng(run.seed, to, stream);
  return childRng(run.seed, to, `${stream}:${from}`);
}
