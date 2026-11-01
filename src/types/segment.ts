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
  | 'driver'
  | 'upgrade'
  | 'firewall'
  | 'log';

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
  | 'bay'
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
  // The bite came from a beam-born block (04 §3.5, §3.7): the file it becomes when eaten is beam-born too, so "a seed
  // that ate reports twice", and an infection carried to the next ship keeps its source (systems/hollow.ts consume).
  beam?: true;
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
// `atePod` the pod number when it was a pod's driver, so the strip can say whose it was (ATE POD 01) and MERGE can
// give it back in place.
// `seed` marks a 2-block seed it dropped into free space (ship 3+, §6.6): it bites like any hollow block,
// and DELETE clears it. `beam` marks a beam-born block (phase 3 slice 2, 04 §3.4–§3.7): a seed that rode the beam in
// behind its target, or a block such a seed (or another beam-born block) made by eating a file; each one left in memory
// at a ship's end adds to TRACE (or feeds HOLLOW's next root once it is aboard). `words` is a beam seed's line from
// 05 §3.5's pool, said when it is deleted (at most SEED_WORDS_PER_SHIP a ship). Slice 4d adds `disguise`. `last` marks the single block LAST LIGHT's root leaves when its DELETE completes (WP11, §6.6):
// HOLLOW stops there, and PURGE or MERGE decides what becomes of it (locked to every tool meanwhile).
export interface HollowSegment extends SegmentBase {
  type: 'hollow';
  root: boolean;
  locked: boolean;
  owner: string;
  ate?: string;
  atePod?: number;
  seed?: true;
  beam?: true;
  words?: string;
  last?: true;
}

export interface RedundancySegment extends SegmentBase {
  type: 'redundancy';
  used: number;
  capacity: number;
}

// One of the people a pod carries, as INSPECT and the LANDING REPORT name them (§6.7, 01-landing §3.8). `line` is who
// they are (≤ COLONIST_LINE_MAX_CHARS), `firstWords` what they say on the ground.
export interface Colonist {
  name: string;        // 'Okafor, Ada': family, then first name
  age: number;
  line: string;        // 'wants to name the first tree.'
  firstWords: string;  // 'Is it morning?'
}

// A pod driver (01-landing §3.8): the 8-block file that flies one pod of 200 colonists down. The colonists sleep in the
// pod; the driver is what HOLLOW can eat and REPAIR can heal, and its integrity decides how the pod lands (a failing
// driver lands hard, a dead one can't launch). Always visible (no scan needed): the drivers are the stakes. At launch
// it uploads into its pod and leaves memory; the pod (state.landing.pods) outlives it either way. Named `POD 03 ·
// OKAFOR`, id `driver_pod03`.
export interface DriverSegment extends SegmentBase, Infectable {
  type: 'driver';
  integrity: number;
  state?: SegmentState;
  pod: number;         // 1-based, numbered in address order when memory is built
  family: string;      // 'Okafor' (proper case; the strip shows it in capitals)
  colonists: number;   // COLONISTS_PER_POD
  featured: Colonist[];
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

// `046.log` (05 §3.2, slice 2): the log UNIT-046 left with its beacon, a locked 2-block file in the unit's rack F from
// the first boot, carried in every packet (`LOCKED · 046 ASKED YOU TO CARRY IT`). It has no integrity, so nothing can
// infect it, and every tool refuses it but SCAN (`IT ISN'T YOURS TO DELETE`). It reads `???` until scanned (or until the
// first key is found), `046.log` after. What has been read lives in run.log, not here: segments are copied through
// packets, and the log's progress belongs to the run.
// `id` is always 'log046' and `size` always 2 (data/log-text.ts LOG_FILE); typed wide so code that copies a segment with
// a new id or size (a test's gap split) still type-checks over the union.
export interface LogSegment extends SegmentBase {
  type: 'log';
  name: '???' | '046.log';
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
  | DriverSegment
  | UpgradeSegment
  | FirewallSegment
  | LogSegment;
