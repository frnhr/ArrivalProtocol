// Playtest 1, C-UNROLL (playtest-1-plan §3.5): the boot's SELF-CHECK, as data. systems/self-check.ts plans it, systems/boot.ts
// plays it on wall time, components/memory-view/SelfCheck.ts paints it on the strip.

// The six stages, in order: the racks assemble (RECEIVE), the unit's own files (SELF, racks E/F), the ship's (SHIP, rack A,
// and the ship's arrival damage), the pod drivers (HOLD), what the packet did not carry (MANIFEST), and the sensors coming up
// before the klaxon (SENSORS).
export type CheckStage = 'receive' | 'self' | 'ship' | 'hold' | 'manifest' | 'sensors';

export const CHECK_STAGES: readonly CheckStage[] = ['receive', 'self', 'ship', 'hold', 'manifest', 'sensors'];

// How a tag looks: damage (`−22% IN TRANSIT`, `ENGINE WEAK`), a fix (`ECC ✓`), something new (a delivery, the charge, a
// key), something foreign (046.log), a seed, HOLLOW.
export type TagTone = 'fault' | 'ecc' | 'new' | 'foreign' | 'seed' | 'hollow';

export interface CheckTag {
  text: string;
  tone: TagTone;
  // A tag that stays after the boot while the file is as it was found: damage until the file is healed past `below` (or is
  // gone), a seed until it is deleted. Every other tag goes with the boot.
  stays: boolean;
  below?: number;
}

// The sound a step makes as the sweep reaches it (audio.ts cues: checkTick, faultFound, eccFixed; the pods' heartbeat).
export type CheckCue = 'tick' | 'fault' | 'ecc' | 'pod' | 'new' | 'seed';

// The first of a kind on the run: the sweep holds on it (run 1: until a click, or SELF_CHECK_HOLD_SEC) and names it.
export type FirstKind = 'log' | 'parcel' | 'seed' | 'hollow';

export type CheckStep =
  // A boot line (data/script.ts BootLineKind, its ordinal among its kind): typed on the TERMINAL, or said as a mark (its
  // record and its effects, no typing).
  | { stage: CheckStage; kind: 'line'; line: string; ordinal: number }
  // The sweep reaches files: they light up, with a tag when something is found there.
  | { stage: CheckStage; kind: 'file'; segIds: string[]; tag: CheckTag | null; cue: CheckCue }
  // Ship 1's ENGINE I/O FAULT, found as the check reaches the engine (systems/faults.ts findFault).
  | { stage: CheckStage; kind: 'fault'; faultId: string }
  // The first of a kind on the run: held (or not, after run 1) and named.
  | { stage: CheckStage; kind: 'first'; first: FirstKind; segIds: string[]; hold: boolean };
