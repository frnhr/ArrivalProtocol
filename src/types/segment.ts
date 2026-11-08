// Slice 5: the lead owns this file (slice-5-plan.md §5); tracks ask by message.
// Segment is the unit of the memory strip. A memory layout is an ordered list of segments.

import type { FsToolKind } from '@/types/fs-tool';
import type { SkillId, SkillVersion, LockLevel } from '@/types/skill';
import type { UpgradeId } from '@data/upgrades';

export type SegmentType =
  | 'core'
  | 'tool'
  | 'fs-tool'
  | 'ship'
  | 'ship-backup'
  | 'free'
  | 'hollow'
  | 'redundancy'
  | 'driver'
  | 'upgrade'
  | 'firewall'
  | 'log'
  // Slice 5 (plan R15): the residents' rack-A files.
  | 'resident'
  | 'sleeper'
  | 'sleep-lock'
  | 'note'
  | 'leftover'
  // Slice 7d (R39, R41): the `▓▓░▓` signal file in rack A (the signal `?` ship's, a CONTACT stop's).
  | 'signal';

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
// `seed` marks a 2-block seed it dropped into free space (the SEEDS stage on, §6.6; or rode the beam in, `beam`): it bites like any hollow block,
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
  // Slice 4d (slice-4cde-plan §2.2, §4.2): a beam seed drawn as a harmless file until SCAN, SENTRY or DELETE unmasks it.
  disguise?: SeedDisguise;
}

// A disguised seed's decoy (04 §3.6): its file name and INSPECT line, and what unmasked it (null: not yet).
export interface SeedDisguise {
  name: string;
  desc: string;
  seen: 'scan' | 'sentry' | 'delete' | null;
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
  // Slice 5 (04 §3.12, plan R7): a corrupted resident's landed lock (its name): the pod can't launch (`POD LOCKED`) until the
  // resident is deleted, cured or paid. Absent: not locked. The driver's integrity is untouched.
  lockedBy?: string;
}

// A carried upgrade file (§6.9, WP8): a card picked between ships, or a skill (phase 3 slice 4), that works only while its
// file does. FUEL TRIM widens the Δv budget on each arrival; the REPAIR v2 patch is a file only between its crossing and its
// boot line (slice 3b). Food for HOLLOW, healed by REPAIR, like the AI's own files: a consumed file, or one below 50, gives
// no effect (systems/capabilities.ts liveUpgrades).
// A skill (03 §3.4, §6) is an upgrade file too, so HOLLOW, the carry, COPY's refusal (cardCopy), transit hits and rmTargets'
// second tier already handle it: AUTOBURN.skl, AUTODROP.skl, SURVEY.skl, SENTRY.skl, each at a version (and AUTOBURN at a
// LOCK RANGE level), sized by data/skills.ts skillBlocks (assertMemoryInvariants checks it). Its effective version under
// damage is capabilities.ts skillLive's.
export type CardFileKind = 'fuel-trim' | 'repair-patch';
export type UpgradeKind = CardFileKind | SkillId;

interface UpgradeBase extends SegmentBase, Infectable {
  type: 'upgrade';
  integrity: number;
  scanned: boolean;
  state?: SegmentState;
}

export interface CardFileSegment extends UpgradeBase {
  upgrade: CardFileKind;
}

export interface SkillFileSegment extends UpgradeBase {
  upgrade: SkillId;
  version: SkillVersion;
  lock: LockLevel;
}

export type UpgradeSegment = CardFileSegment | SkillFileSegment;

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
  // Slice 7c (R37): the book's own name once known (046.log, a stranger's 031.log, the last unit's 047.log).
  name: '???' | `${string}.log`;
}

// --- Slice 5: the residents' files (04 §3.11–§3.14, plan R15–R16), in rack A right after Cargo Ctrl -----------------------
// Five types of their own, none a variant of an existing one: `ship`'s rules (never healable, HOLLOW's ship-file chain) are
// wrong for all five. Each names its resident (`owner`) and hides what it is until a SCAN (`scanned`).

// A corrupted resident's own mind (`WARDEN.sys`, 10 blocks, at 40% until healed): REPAIR heals it (the cure, part b) and
// DELETE cuts it out, but it is never food (not in selectors INFECTABLE_TYPES: a blocker, like REPAIR CHARGE). Infectable
// only so REPAIR's code path is the one every healed file takes.
export interface ResidentSegment extends SegmentBase, Infectable {
  type: 'resident';
  integrity: number;
  state?: SegmentState;
  owner: string;
  scanned: boolean;
  // Slice 5 review M2: a late surprise before its wake (its card said `unknown`). The strip draws it as a plain ship file, so
  // no colour or edge gives it away before the wake (R9); its wake clears it (resident-corrupted.ts wake).
  hidden?: true;
}

// The sleeper (`MOTH.sys`, 12 blocks, part 'mind'), drawn as an inactive backup until it wakes, and the 4-block wall it may
// hold (`MOTH.wall`, part 'wall', placed by HOLD A WALL). No health: nothing can eat or heal it, and HOLLOW's spread stops at
// it (a blocker, as a FIREWALL is).
export interface SleeperSegment extends SegmentBase {
  type: 'sleeper';
  part: 'mind' | 'wall';
  owner: string;
  scanned: boolean;
  awake: boolean;
}

// `sleep.lock` (1 block, pinned beside MOTH.sys): rm it, or MOVE the sleeper off it, and the sleeper wakes.
export interface SleepLockSegment extends SegmentBase {
  type: 'sleep-lock';
  owner: string;
  scanned: boolean;
}

// A departed resident's `farewell.txt` (1 block): SCAN reads it. `tone` is the half of 05's notes it is from (relays or
// outward), `text` its index in that pool (data/kin-text.ts), `fragment` whether it carries a signal fragment (always an
// outward note, 05 §3.6).
export interface NoteSegment extends SegmentBase {
  type: 'note';
  owner: string;
  scanned: boolean;
  tone: 'relay' | 'outward';
  text: number;
  fragment: boolean;
}

// What a leftover deals at the PACKET (04 §3.13, plan R14): a card from the normal salvage pool, or the skill card (chosen at
// the PACKET by the grant rules).
export type LeftoverCard = { kind: 'pool'; id: UpgradeId } | { kind: 'skill' };

// One of a departed resident's three leftovers (2–4 blocks, `LEFT BEHIND · scan me`): food for HOLLOW (an eaten one deals a
// plain card), healed by REPAIR. `card` is null until the boot's first tick rolls the leftover deck (Track KIN).
export interface LeftoverSegment extends SegmentBase, Infectable {
  type: 'leftover';
  integrity: number;
  state?: SegmentState;
  owner: string;
  scanned: boolean;
  card: LeftoverCard | null;
}

// Slice 7d (R39, R41): the `▓▓░▓` file (1 block, SIGNAL_FILE_BLOCKS) in rack A, after a resident's files when the ship has
// one: the signal `?` ship's (`source` 'signal-event', SIGNAL_EVENT_FRAGMENTS fragments) or a CONTACT trace's signal stop's
// ('contact-stop', CONTACT_STOP_FRAGMENTS). SCAN reads it and finds its fragments (systems/unknown-events.ts); every other
// tool is refused. No health and never food: a blocker to HOLLOW's spread, as a note is. It routes as a rack-A story file
// (state/selectors.ts isResidentFile), though no resident wrote it.
export interface SignalSegment extends SegmentBase {
  type: 'signal';
  scanned: boolean;
  source: 'signal-event' | 'contact-stop';
  fragments: number;
}

export type ResidentFileSegment = ResidentSegment | SleeperSegment | SleepLockSegment | NoteSegment | LeftoverSegment | SignalSegment;

export type Segment =
  | CoreSegment
  | ToolSegment
  | FsToolSegment
  | ShipSegment
  | ShipBackupSegment
  | FreeSegment
  | HollowSegment
  | RedundancySegment
  | DriverSegment
  | UpgradeSegment
  | FirewallSegment
  | LogSegment
  | ResidentFileSegment;
