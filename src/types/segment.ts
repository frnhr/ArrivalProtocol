// Segment is the unit of the memory strip. A memory layout is an ordered list of segments.

import type { FsToolKind } from '@/types/fs-tool';

export type SegmentType =
  | 'core'
  | 'tool'
  | 'skill'
  | 'fs-tool'
  | 'ship'
  | 'ship-backup'
  | 'free'
  | 'hollow'
  | 'redundancy'
  | 'soul'
  | 'upgrade'
  | 'firewall';

export type SegmentState =
  | 'intact'
  | 'corrupt'
  | 'partial'
  | 'inactive'
  | 'locked'
  | 'busy'
  | 'offline'
  | 'transferring'
  | 'repairing';

// What a file does for the ship or the mind (§6.4). Game code finds files by role (selectors
// getByRole) or by type, never by id, so a copy, a moved file or a swapped-in backup keeps
// working; capabilities.ts turns each role's best live copy into what the ship can do.
export type SegmentRole =
  | 'engine-io'
  | 'thrust-ctrl'
  | 'reactor'
  | 'autopilot'
  | 'sensor'
  | 'navplot'
  | 'telemetry'
  | 'comms'
  | 'core'
  | 'stasis'
  | 'life'
  | 'printer'
  | 'cargo'
  | 'redundancy';

interface SegmentBase {
  id: string;
  name: string;
  size: number;
  desc?: string;
  role?: SegmentRole;
  // Runtime-mutable: flagged true while an op is animating against this segment.
  operating?: boolean;
}

// HOLLOW's bite (§6.6). Every file with a health number can be infected: HOLLOW eats it from the
// side that faces it, integrity drains, and at 0 the file turns into HOLLOW too. A cure (a REPAIR
// that reaches 100) clears the infection and leaves the file RECOILING for a while: HOLLOW skips
// it on its next bites.
export type InfectionSide = 'left' | 'right';

export interface Infection {
  side: InfectionSide;   // the end the red crawls in from (the side that faces HOLLOW)
}

interface Infectable {
  infected?: Infection;
  recoilUntilAi?: number;  // clock.aiSec until which bites skip it (set by a cure)
}

export interface CoreSegment extends SegmentBase, Infectable {
  type: 'core';
  integrity: number;
  scanned: boolean;
  state?: SegmentState;
  // Concurrency budget: max number of fs-tool ops the player can run at once.
  // This is the AI's compute substrate — the same Core that runs the player IS
  // what runs the tools. At capacity, new ops are refused (hard cap).
  capacity: number;
}

export interface ToolSegment extends SegmentBase, Infectable {
  type: 'tool';
  integrity: number;
  scanned: boolean;
  state?: SegmentState;
}

export interface SkillSegment extends SegmentBase, Infectable {
  type: 'skill';
  integrity: number;
  scanned: boolean;
  state?: SegmentState;
}

export interface FsToolSegment extends SegmentBase, Infectable {
  type: 'fs-tool';
  integrity: number;
  scanned: boolean;
  fsTool: FsToolKind;
  state?: SegmentState;
  // Tool revision. Starts at 1. Higher versions unlock new capabilities
  // (e.g. Repair v2 can compact the Redundancy segment). Max per kind lives
  // in data/fs-tools.ts as TOOL_MAX_VERSION.
  version: number;
}

export interface ShipSegment extends SegmentBase, Infectable {
  type: 'ship';
  integrity: number;
  scanned: boolean;
  backup?: string;
  state?: SegmentState;
}

export interface ShipBackupSegment extends SegmentBase, Infectable {
  type: 'ship-backup';
  integrity: number;
  scanned: boolean;
  state?: SegmentState;
  // The job this backup can take over and the name of the file that does it (Thrust.alt: thrust-ctrl, `Thrust
  // Controller`), from the ship's data; the SWAP that hands it the job clears it. The primary's own link (`backup`)
  // goes with the primary, so this is how a SWAP still puts the backup into service once the primary was deleted or
  // eaten (WP10 review: the healthy backup was stranded behind `NO BACKUP TO SWAP TO`).
  backs?: { role: SegmentRole; name: string };
}

export interface FreeSegment extends SegmentBase {
  type: 'free';
  // Set on the free blocks a running move/copy carved out around its clone (the op's id). They
  // are part of that op's address range: nothing merges them or places into them, so a cancel
  // can put the exact original segments back (systems/memory-ops.ts).
  reservedBy?: number;
}

// HOLLOW (§1, §6.6): the caretaker of the previous wave, starving in the same memory as you. Its
// ROOT is the block the ship arrives with (the `R` token of a rack layout): black, crawling red,
// LOCKED to every tool until ship 5's duel. Every file it eats turns into one more hollow block of
// the same size, in place, and bites too. `owner` is what it is called on screen (`???` until it
// names itself); `ate` is the file an eaten block used to be, so INSPECT can say what was lost, and
// `ateCluster` the cluster's code when it was colonists, so the strip can say where they went (ATE C12).
// `seed` marks a 2-block seed it dropped into free space (ship 3+, §6.6): it bites like any hollow block,
// and DELETE clears it. `last` marks the single block LAST LIGHT's root leaves when its DELETE completes (WP11, §6.6):
// HOLLOW stops there, and PURGE or MERGE decides what becomes of it (locked to every tool meanwhile).
export interface HollowSegment extends SegmentBase {
  type: 'hollow';
  root: boolean;
  locked: boolean;
  owner: string;
  ate?: string;
  ateCluster?: string;
  seed?: true;
  last?: true;
}

export interface RedundancySegment extends SegmentBase {
  type: 'redundancy';
  used: number;
  capacity: number;
}

// One of the people a soul cluster holds, as the INSPECT panel and the WAKE REPORT name them
// (§6.7). `line` is who they are (≤ COLONIST_LINE_MAX_CHARS), `firstWords` what they say when
// they wake.
export interface Colonist {
  name: string;        // 'Okafor, Ada': family, then first name
  age: number;
  line: string;        // 'wants to name the first tree.'
  firstWords: string;  // 'Is it morning?'
}

// A soul cluster (§1, §6.7): 200 colonists stored as one 8-block file in the SOUL ARCHIVE. They are
// not in pods; they are in the same memory as you. Always visible once the archive is unsealed
// (no scan needed). Sealed, the cluster is part of a grey slab that hides everything about it,
// health included, until the STASIS reveal (systems/reveal.ts). Printing turns it into free space
// and a line in the WAKE REPORT.
export interface SoulSegment extends SegmentBase, Infectable {
  type: 'soul';
  integrity: number;
  cluster: string;     // 'C12': numbered in address order when the ship's memory is built
  family: string;      // 'Okafor' (proper case; the strip shows it in capitals)
  souls: number;       // colonists in the cluster (SOULS_PER_CLUSTER)
  featured: Colonist[];
  sealed: boolean;
  state?: SegmentState;
}

// A carried upgrade file (§6.9, WP8): a card picked between ships that works only while its file does.
// FUEL TRIM widens the Δv budget on each arrival; AUTOBURN.skl (WP9) is the skill trained from your own
// captures. Food for HOLLOW, healed by REPAIR, like the AI's own files: a consumed file, or one below 50,
// gives no effect (systems/capabilities.ts liveUpgrades).
export type UpgradeKind = 'fuel-trim' | 'autoburn';

export interface UpgradeSegment extends SegmentBase, Infectable {
  type: 'upgrade';
  upgrade: UpgradeKind;
  integrity: number;
  scanned: boolean;
  state?: SegmentState;
}

// FIREWALL.sys (§6.6, §6.9, WP8): a 2-block file HOLLOW can't infect and can't bite past. It has no
// health to eat or heal: it is a wall the kid places with MOVE (next to the root, it blocks that side
// for good). DELETE removes it like any file.
export interface FirewallSegment extends SegmentBase {
  type: 'firewall';
}

export type Segment =
  | CoreSegment
  | ToolSegment
  | SkillSegment
  | FsToolSegment
  | ShipSegment
  | ShipBackupSegment
  | FreeSegment
  | HollowSegment
  | RedundancySegment
  | SoulSegment
  | UpgradeSegment
  | FirewallSegment;
