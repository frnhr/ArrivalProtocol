import type { ShipKey } from '@/types/map';
import type { ShipLandingDef } from '@/types/landing';
import type { AuthoredOverride } from '@data/run1-arm';

// 01-landing §3.15's roller (slice-3a-plan §1.1 item 11, §2.1): one ship's landing from its ShipKey's 'landing' stream
// (risk 9: 02's key, so a waiting ship lands the same next run): the LZs and their counts (an uneven split 1 in 2 from
// layer 2), widths, the forgiveness class and terrain word, no-go arcs by layer (within 150 km of a bracket edge), POOR
// site data (rolled and stored; it plays GOOD until slice 6), and drag. It reuses data/landing-def.ts validateLandingDef.
// Driver arrival damage stays data/driver-damage.ts's (by layer). Track GEN owns this file after the foundation.

export interface RolledLanding extends ShipLandingDef {
  site: 'good' | 'poor';
}

// TODO(3a-GEN): the roll. `authored` is an authored ship's written parts (data/run1-arm.ts RUN1_AUTHORED), honoured over
// the roll.
export function rollLanding(key: Readonly<ShipKey>, layer: number, pods: number, authored: Readonly<AuthoredOverride> | null): RolledLanding {
  void authored;
  throw new Error(`TODO(3a-GEN): rollLanding (slot ${key.slot}, layer ${layer}, ${pods} pods)`);
}
