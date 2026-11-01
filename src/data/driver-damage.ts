import type { HurtDriver } from '@data/memory';
import type { ShipDef } from '@data/ships';
import type { Rng } from '@systems/rng';

// Driver arrival damage (docs/phase3/01-landing.md §3.8, §3.15; slice-2-plan §1.1 item 9), pure: the drivers that sat for
// decades arrive hurt, rolled by the ship's layer on the stream childRng(seed, slot, 'hurt'):
//   layer 1 (ARES-VII)     scripted: POD 02 at 44% (ShipDef.memory.drivers.hurt)
//   layer 2+               ceil(pods ÷ DRIVER_ROLLED_PER_PODS) drivers at DRIVER_ROLLED_MIN–MAX
//   layer ≥ DRIVER_FAILING_FROM_LAYER   one more at DRIVER_FAILING_MIN–MAX
// Never on the lead pod nor on `avoid` (the drivers flanking the root slot: a hurt driver beside the root would be eaten
// before a kid can react, slice-2-plan risk 9). Track OPENING owns this file, hurtDriversFor included (data/memory.ts
// re-exports it): it implements the roll and has hurtDriversFor call it. Type-only imports from memory.ts and ships.ts,
// so the re-export makes no runtime cycle.

export interface DriverDamageInput {
  layer: number;
  pods: number;
  lead: number;                        // 1-based, never hurt by the roll
  avoid: readonly number[];            // 1-based pods the roll never hurts (the root slot's neighbours)
  firstRun: boolean;                   // the tutorial run: a scripted ship keeps its written pods
  scripted: readonly HurtDriver[] | null;   // the ship's written list ('scripted' damage), null for 'rolled'
}

// STUB (foundation): the written list as it stands (none for a rolled ship); Track OPENING rolls the layer's damage.
export function driverArrivalDamage(input: Readonly<DriverDamageInput>, rng: Rng): HurtDriver[] {
  void rng;
  return (input.scripted ?? []).map((hurt) => ({ ...hurt }));
}

// The drivers a ship arrives with hurt on this run (01-landing §3.8): what state/initial.ts builds the ship's memory with.
// Today: the ship's written ones, except on a later run of a ship whose first run is written (ARES-VII): its families are
// reseeded, and so are the hurt drivers, each drawn from `rng` (its own stream, 'hurt') among the pods that are not the
// lead and not already hurt. The pod count is the LZ counts' sum (validatePodRacks checks it equals the drivers), so this
// file needs nothing from memory.ts at runtime. Track OPENING: route 'rolled' ships through driverArrivalDamage here.
export function hurtDriversFor(ship: ShipDef, firstRun: boolean, rng: Rng): HurtDriver[] {
  const written = ship.memory.drivers.hurt;
  if (written.length === 0 || firstRun || ship.memory.drivers.firstRun === null) return written.map((hurt) => ({ ...hurt }));
  const pods = ship.landing.lzs.reduce((sum, lz) => sum + lz.pods, 0);
  const candidates: number[] = [];
  for (let pod = 1; pod <= pods; pod++) if (pod !== ship.memory.drivers.lead) candidates.push(pod);
  return written.map((hurt) => {
    const index = Math.floor(rng() * candidates.length);
    const pod = candidates[index];
    if (pod === undefined) throw new Error(`hurtDriversFor ${ship.id}: no pod besides the lead left to hurt`);
    candidates.splice(index, 1);
    return { pod, integrity: hurt.integrity };
  });
}
