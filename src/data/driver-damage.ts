import type { HurtDriver } from '@data/memory';
import type { ShipDef } from '@data/ships';
import type { Rng } from '@systems/rng';
import {
  DRIVER_ROLLED_MIN, DRIVER_ROLLED_MAX, DRIVER_ROLLED_PER_PODS, DRIVER_FAILING_MIN, DRIVER_FAILING_MAX,
  DRIVER_FAILING_FROM_LAYER,
} from '@data/tuning';

// Driver arrival damage (docs/phase3/01-landing.md §3.8, §3.15; slice-2-plan §1.1 item 9), pure: the drivers that sat for
// decades arrive hurt, rolled by the ship's layer on the stream childRng(seed, slot, 'hurt'):
//   layer 1 (ARES-VII)     scripted: POD 02 at 44% (ShipDef.memory.drivers.hurt)
//   layer 2+               ceil(pods ÷ DRIVER_ROLLED_PER_PODS) drivers at DRIVER_ROLLED_MIN–MAX
//   layer ≥ DRIVER_FAILING_FROM_LAYER   one more at DRIVER_FAILING_MIN–MAX
// Never on the lead pod nor on `avoid` (the drivers flanking the root slot: a hurt driver beside the root would be eaten
// before a kid can react, slice-2-plan risk 9). Track OPENING owns this file, hurtDriversFor included (data/memory.ts
// re-exports it). Type-only imports from memory.ts and ships.ts, so the re-export makes no runtime cycle.

export interface DriverDamageInput {
  layer: number;
  pods: number;
  lead: number;                        // 1-based, never hurt by the roll
  avoid: readonly number[];            // 1-based pods the roll never hurts (the root slot's neighbours)
  firstRun: boolean;                   // the tutorial run: a scripted ship keeps its written pods
  scripted: readonly HurtDriver[] | null;   // the ship's written list ('scripted' damage), null for 'rolled'
}

// A whole number in [min, max], both ends included.
function rollBetween(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

// The hurt drivers for one arrival. A scripted ship on its tutorial run keeps its written pods; on a later run the same
// integrities move to other pods (v2 §5.2: a returning unit meets ship 1 reseeded, never the lead). A rolled ship draws
// its degraded drivers, then its failing one, each from the pods not yet hurt, never the lead or `avoid`. Draw order is
// fixed (pod, then integrity, per driver), so a seed always hurts the same pods by the same amounts.
export function driverArrivalDamage(input: Readonly<DriverDamageInput>, rng: Rng): HurtDriver[] {
  const { layer, pods, lead, avoid, firstRun, scripted } = input;
  const fail = (why: string): never => { throw new Error(`driverArrivalDamage: ${why}`); };
  if (!(Number.isInteger(layer) && layer >= 1)) fail(`layer ${layer}`);
  if (!(Number.isInteger(pods) && pods >= 1)) fail(`${pods} pods`);
  if (!(lead >= 1 && lead <= pods)) fail(`lead pod ${lead} is not one of ${pods}`);
  if (scripted !== null && firstRun) return scripted.map((hurt) => ({ ...hurt }));
  const candidates: number[] = [];
  for (let pod = 1; pod <= pods; pod++) if (pod !== lead && !avoid.includes(pod)) candidates.push(pod);
  const draw = (): number => {
    const index = Math.floor(rng() * candidates.length);
    const pod = candidates[index];
    if (pod === undefined) return fail(`no pod left to hurt (${pods} pods, lead ${lead}, avoid ${avoid.join(',') || '-'})`);
    candidates.splice(index, 1);
    return pod;
  };
  if (scripted !== null) return scripted.map((hurt) => ({ pod: draw(), integrity: hurt.integrity }));
  const hurt: HurtDriver[] = [];
  const degraded = Math.ceil(pods / DRIVER_ROLLED_PER_PODS);
  for (let i = 0; i < degraded; i++) hurt.push({ pod: draw(), integrity: rollBetween(rng, DRIVER_ROLLED_MIN, DRIVER_ROLLED_MAX) });
  if (layer >= DRIVER_FAILING_FROM_LAYER) hurt.push({ pod: draw(), integrity: rollBetween(rng, DRIVER_FAILING_MIN, DRIVER_FAILING_MAX) });
  return hurt;
}

// The pods flanking the ship's root slot (`S`), 1-based: the nearest driver before it and after it in address order
// (free blocks between them don't count). Empty for a ship with no slot. Pod numbers run in address order through the
// pod racks B, C, D (data/memory.ts POD_RACK_KEYS; parsed here from the layout words so this file needs nothing from
// memory.ts at runtime: memory.ts validates the layouts at load).
export function rootSlotNeighbours(ship: ShipDef): number[] {
  const words = (['B', 'C', 'D'] as const).flatMap((rack) => ship.memory.podRacks[rack]?.trim().split(/\s+/) ?? []);
  const slot = words.indexOf('S');
  if (slot < 0) return [];
  const podAt = (index: number): number => words.slice(0, index + 1).filter((word) => word === 'P').length;
  const neighbours: number[] = [];
  for (let i = slot - 1; i >= 0; i--) if (words[i] === 'P') { neighbours.push(podAt(i)); break; }
  for (let i = slot + 1; i < words.length; i++) if (words[i] === 'P') { neighbours.push(podAt(i)); break; }
  return neighbours;
}

// The drivers a ship arrives with hurt on this run (01-landing §3.8): what state/initial.ts builds the ship's memory with.
// `rng` is the ship's own stream (childRng(seed, slot, 'hurt')). The pod count is the LZ counts' sum (validatePodRacks
// checks it equals the drivers), so this file needs nothing from memory.ts at runtime.
export function hurtDriversFor(ship: ShipDef, firstRun: boolean, rng: Rng): HurtDriver[] {
  const drivers = ship.memory.drivers;
  return driverArrivalDamage({
    layer: ship.layer,
    pods: ship.landing.lzs.reduce((sum, lz) => sum + lz.pods, 0),
    lead: drivers.lead,
    avoid: rootSlotNeighbours(ship),
    // A ship whose first run is written (ARES-VII) keeps its pods on that run; a scripted ship without a written first run
    // has nothing to reseed from, so it always keeps them.
    firstRun: firstRun || drivers.firstRun === null,
    scripted: drivers.damage === 'scripted' ? drivers.hurt : null,
  }, rng);
}
