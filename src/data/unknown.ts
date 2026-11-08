// Slice 7d: the `?` ships' data (docs/phase3/impl/slice-7-plan.md §2.4 7d, R39–R40; 02-map §3.5, 05-story §3.3, §3.12).
// Data and types only (support/import-guard): the gate, the old colonies of the units long before, and the signal file's
// fixed id. systems/unknown-events.ts plays them; data/unknown-text.ts words them.
import type { Reservations } from '@/types/map';

// What this build plays of the three `?` ships (R39, R40): the `??? · NO TRANSPONDER` card, the old colony's letter at its
// boot, the signal ship's `▓▓░▓` file worth SIGNAL_EVENT_FRAGMENTS, the gone resident behind a `?` card (its note's fragment
// as slice 5 built it), and the chart's `▓░` glyph on the `?` ships that carry fragments. Down: the three are ordinary cards,
// the old colony and the signal ship hold nothing, and only the notes collect signals (slice 5's R18).
export const UNKNOWN_EVENTS_BUILT: boolean = false;

export type UnknownEvent = NonNullable<Reservations['unknownEvent']>;

// The old colonies (05 §3.12: OLDWELL, SUNDIAL and CANDLEWICK, "from units long before"): each with the unit that founded
// it, from before the relay strangers (031, 038), so no unit the kid meets is older. The ship's own stream picks one
// (systems/unknown-events.ts oldColonyOf).
export interface OldColony {
  name: string;
  unit: number;
}

export const OLD_COLONIES: readonly OldColony[] = [
  { name: 'OLDWELL', unit: 9 },
  { name: 'SUNDIAL', unit: 17 },
  { name: 'CANDLEWICK', unit: 24 },
];

// The signal file's id: fixed, as the residents' files' are (one a ship; a ship rebuilt from its ShipKey has the same id).
export const SIGNAL_SEG_ID = 'signal';
