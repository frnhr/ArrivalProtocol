import type { HurtDriver } from '@data/memory';
import type { Rng } from '@systems/rng';

// Driver arrival damage (docs/phase3/01-landing.md §3.8, §3.15; slice-2-plan §1.1 item 9), pure: the drivers that sat for
// decades arrive hurt, rolled by the ship's layer on the stream childRng(seed, slot, 'hurt'):
//   layer 1 (ARES-VII)     scripted: POD 02 at 44% (ShipDef.memory.drivers.hurt)
//   layer 2+               ceil(pods ÷ DRIVER_ROLLED_PER_PODS) drivers at DRIVER_ROLLED_MIN–MAX
//   layer ≥ DRIVER_FAILING_FROM_LAYER   one more at DRIVER_FAILING_MIN–MAX
// Never on the lead pod nor on `avoid` (the drivers flanking the root slot: a hurt driver beside the root would be eaten
// before a kid can react, slice-2-plan risk 9). Track OPENING owns this file and implements the roll; state/initial.ts's
// hurtDriversFor calls it then.

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
