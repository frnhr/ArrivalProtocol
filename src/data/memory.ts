import type {
  Segment, ShipSegment, ShipBackupSegment, CoreSegment, ToolSegment, SkillSegment, FsToolSegment,
  RedundancySegment, DriverSegment, HollowSegment, LogSegment, SegmentRole,
} from '@/types/segment';
import type { ShipDef } from '@data/ships';
import type { Rng } from '@systems/rng';
import { assertMemoryInvariants, freeSegment, mergeAdjacentFree, segmentStarts, newSegId } from '@systems/memory-ops';
import { createToolFiles } from '@data/fs-tools';
import { rollRoster, rollChildAge, type ScriptedRoster } from '@data/souls';
import {
  SEG_NAME_MAX_CHARS, RACK_BLOCKS, RACK_COUNT, DRIVER_BLOCKS, COLONISTS_PER_POD, INTEGRITY_MAX, LAST_BLOCK_SIZE,
  POD_RACK_MIN_FREE, UNIT_TAIL_BLOCKS, WALL_MIN_BLOCKS, PRE_FINAL_ROOT_CAP, FINAL_ROOT_MAX_BLOCKS,
} from '@data/tuning';
import { integrityState } from '@state/selectors';
import { HOLLOW_DESC } from '@data/hollow-text';
import { driverName } from '@data/landing-text';
import { driverSegId } from '@data/pod-ids';
import { LOG_FILE } from '@data/log-text';

// The ship's memory (§3.2, §4.2, 01-landing §3.16): 384 blocks in 6 RACKS of 64, built from ship data.
//   A    the ship's files (the same on every ship)
//   B–D  the pod racks: the pods' drivers and the root slot HOLLOW's root lands in, from a layout string per rack
//   E    your AI files            F  your filesystem tools and REPAIR CHARGE (E–F: the receiver)
// Racks are places: debris hits RACK C, the belt racks A–B, and the address labels name them. A
// segment's address is the running sum of the sizes before it (systems/memory-ops.ts); a rack is
// address / 64. Every visible file either does something or says it doesn't (§8). The AI's own
// files (Core, tools, fs-tools) and the drivers are always visible; ship files hide their health
// until scanned. Every ship is FULL (384) until slice 3's memory classes: new code must not add
// uses of MEMORY_TOTAL_BLOCKS beyond assertMemoryInvariants.

export const MEMORY_TOTAL_BLOCKS = RACK_BLOCKS * RACK_COUNT;
export const RACK_NAMES: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'F'];

// A run of free blocks in a written rack.
export interface FreeSpec {
  free: number;
}

export type ShipFileSpec = ShipSegment | ShipBackupSegment;
export type AiFileSpec = CoreSegment | ToolSegment | SkillSegment | FsToolSegment | RedundancySegment | LogSegment;
export type RackItem<Spec> = Spec | FreeSpec;

// A driver that arrives hurt (01-landing §3.8: run 1's POD 02 at 44%). Pod numbers are 1-based, as on screen.
export interface HurtDriver {
  pod: number;
  integrity: number;
}

// The pods' people and drivers on one ship (§6.7, 01-landing §3.8). Pod numbers are 1-based, as on screen.
export interface ShipDriversDef {
  familiesSeedStream: string;          // childRng stream for the seeded families and colonists
  // How the drivers arrive hurt (01-landing §3.8, §3.15): 'scripted', the written `hurt` list (ARES-VII's POD 02 at 44%);
  // 'rolled', by the ship's layer (data/driver-damage.ts driverArrivalDamage: ceil(pods ÷ 5) degraded, one failing from
  // layer 4), with `hurt` empty.
  damage: 'scripted' | 'rolled';
  // The drivers that arrive hurt (a list, so slice 2's rolled arrival damage needs no type change). On a later run of
  // a ship whose first run is written (firstRun below), they are reseeded among the other pods (hurtDriversFor).
  hurt: readonly HurtDriver[];
  lead: number;                        // the story's pod: first in the credits, the scripted bite's target beside the root
  firstRun: ScriptedRoster | null;     // the families and lead colonist the first run always meets
}

// The pod racks by their letter (01-landing §3.16). Keyed by rack so slice 3's smaller memory classes can leave rack D
// out (the field becomes Partial); code walks POD_RACK_KEYS and the racks present, never assumes all three.
export const POD_RACK_KEYS = ['B', 'C', 'D'] as const;
export type PodRackKey = (typeof POD_RACK_KEYS)[number];

export interface ShipMemoryDef {
  rackA: readonly RackItem<ShipFileSpec>[];
  // The pod racks as layout strings (§4.2, 01-landing §3.16): `P` an 8-block pod driver, `S` the root slot (0 blocks in
  // the layout: when the threat ladder brings a root, buildShipMemory writes it there and takes its blocks off the slot
  // rack's trailing free; without one the slot is nothing, and the free tokens around it are plain free space), `_n` n
  // free blocks; space-separated, each rack summing to RACK_BLOCKS. Phase 2's written root `R` is gone (slice 2): a root
  // only ever comes from the ladder, through `S`; test fixtures plant theirs (tests/unit/support/hollow-world.ts).
  podRacks: Record<PodRackKey, string>;
  // Racks E and F as written for a unit that arrives fresh (ship 1). Later ships hold whatever the
  // unit carried (systems/carry.ts), so theirs is null.
  aiFiles: { E: readonly RackItem<AiFileSpec>[]; F: readonly RackItem<AiFileSpec>[] } | null;
  drivers: ShipDriversDef;
}

// --- Rack A: the same on every ship (§4.2) --------------------------------------------------------

export const RACK_A: readonly RackItem<ShipFileSpec>[] = [
  { id: 'life', name: 'Life Support', type: 'ship', role: 'life', size: 8, integrity: 100, scanned: false,
    desc: 'Idle. 0 breathing occupants. Keeps air and heat for the crew decks. No flight effect.' },
  { id: 'reactor', name: 'Reactor', type: 'ship', role: 'reactor', size: 6, integrity: 100, scanned: false,
    desc: 'Powers the engine AND your thinking: every busy thread takes 25% of thrust. Damage lowers the ceiling.' },
  { id: 'thrust', name: 'Thrust Controller', type: 'ship', role: 'thrust-ctrl', size: 8, integrity: 100, scanned: false,
    backup: 'thrust_b',
    desc: 'Ship-side thruster command translator. If it fails, the engine starts firing by itself. Without it the engine is dead.' },
  { id: 'thrust_b', name: 'Thrust.alt', type: 'ship-backup', size: 8, integrity: 100, scanned: false,
    backs: { role: 'thrust-ctrl', name: 'Thrust Controller' },
    desc: 'Redundant copy installed by the original engineers. Inactive. Can be swapped in to replace the primary thrust controller. Costs no REPAIR CHARGE.' },
  { id: 'stasis', name: 'Stasis', type: 'ship', role: 'stasis', size: 4, integrity: 100, scanned: false,
    desc: 'Keeps the pods\' sleepers cold. No flight effect.' },
  // Bay Ctrl (01-landing §3.4) takes Printer Uplink's 6 blocks. Its damage spaces the launches out (capabilities
  // BAY_CADENCE_BY_BAND); without it no pod can launch (BAY OFFLINE, said `NO BAY CTRL`). A ship file with no backup.
  { id: 'bay', name: 'Bay Ctrl', type: 'ship', role: 'bay', size: 6, integrity: 100, scanned: false,
    desc: 'Runs the pod bay\'s launch rails. Damaged, pods launch further apart; gone, no pod can launch.' },
  { id: 'cargo', name: 'Cargo Ctrl', type: 'ship', role: 'cargo', size: 6, integrity: 100, scanned: false,
    desc: 'Holds inventory. No flight effect.' },
  { free: 18 },
];

// --- Racks E and F for a fresh unit (ship 1, §4.2) -------------------------------------------------
// Engine I/O and Sensor Interp arrive hurt by the transmission (the boot's ECC line names them).

export const FRESH_UNIT_RACK_E: readonly RackItem<AiFileSpec>[] = [
  { id: 'core', name: 'AI Core', type: 'core', role: 'core', size: 16, integrity: 100, scanned: true, capacity: 2,
    desc: 'You. Consciousness AND compute pool: each running filesystem operation claims one thread; at capacity, new ops wait. Damage glitches the whole screen, and below 50% you think one thing at a time. Cannot be deleted; heal it with Repair, paid in REPAIR CHARGE.' },
  { id: 'engine', name: 'Engine I/O', type: 'tool', role: 'engine-io', size: 8, integrity: 85, state: 'intact', scanned: true,
    desc: 'Your link to the engine. The more damaged it is, the weaker and shakier the engine. Repair heals it, paid in REPAIR CHARGE; the engine is off while it repairs.' },
  { id: 'autopilot', name: 'Autopilot', type: 'tool', role: 'autopilot', size: 4, integrity: 100, scanned: true,
    desc: 'Points the ship for the W/A/S/D presets. Badly damaged, the presets stop working: turn by hand with Q/E.' },
  { id: 'sensint', name: 'Sensor Interp', type: 'tool', role: 'sensor', size: 8, integrity: 78, state: 'partial', scanned: true,
    desc: 'Turns raw sensor data into the predicted path. Damaged: the readouts are only ≈ right. Badly damaged: PATH UNCERTAIN.' },
  { id: 'navplot', name: 'Nav Plotter', type: 'tool', role: 'navplot', size: 6, integrity: 100, scanned: true,
    desc: 'Draws the NAV PLOT. Without it the plot shows NO SIGNAL.' },
  { id: 'telem', name: 'Telemetry', type: 'tool', role: 'telemetry', size: 6, integrity: 100, scanned: true,
    desc: 'Feeds the ship\'s numbers to your screens. Below 60% the digits start to scramble.' },
  { id: 'comms', name: 'AI Comms', type: 'tool', role: 'comms', size: 4, integrity: 100, scanned: true,
    desc: 'Your radio to ARRIVAL CONTROL, and your way out: transmission to the next ship, or BEAM OUT.' },
  { free: 12 },
];

// Only SCAN comes with the unit; the other tools arrive as licences into the free tail of this
// rack (systems/licences.ts), next to REPAIR CHARGE.
export const FRESH_UNIT_RACK_F: readonly RackItem<AiFileSpec>[] = [
  ...createToolFiles('scan'),
  // 046.log (05 §3.2): in the unit's memory from the first boot, carried in every packet. Before REPAIR CHARGE, where
  // carry.ts packs it too (after the tools), so the licences still land next to the charge.
  structuredClone(LOG_FILE),
  // REPAIR CHARGE (the old Quantum Redundancy pool): spent by repairs, one point at a time.
  { id: 'redund', name: 'Repair Charge', type: 'redundancy', role: 'redundancy', size: 36, used: 36, capacity: 72,
    desc: 'Transmitted alongside the AI. Every point a Repair heals costs charge (bigger files cost more). Spent blocks stay empty until Repair v2 squeezes them out; when the last point is spent the blocks become free space. Deleting it frees the space and loses the charge.' },
  { free: 23 },
];

const FRESH_CHARGE_FILE: RedundancySegment = (() => {
  const charge = FRESH_UNIT_RACK_F.find((item): item is RedundancySegment => !('free' in item) && item.type === 'redundancy');
  if (!charge) throw new Error('memory: a fresh unit has no REPAIR CHARGE');
  return charge;
})();

// The REPAIR CHARGE a fresh unit is sent with (§6.5: 36 on ship 1): what HOLLOW says it was
// sent with too (`> hello 047. they sent me with 36 blocks of charge too.`).
export const FRESH_UNIT_CHARGE: number = FRESH_CHARGE_FILE.used;

// A copy of the fresh unit's REPAIR CHARGE file. A unit that spent its last point has no pool left (the
// blocks became free space), but its arrival still brings the floor and the star credit (§6.5), so the
// arrival writes the pool again from this one (systems/carry.ts).
export function freshChargeFile(): RedundancySegment {
  return structuredClone(FRESH_CHARGE_FILE);
}

// --- The root: HOLLOW's first block (§6.6) ----------------------------------------------------------

// The root, as the ladder brings it into the `S` slot (placeRoot). `owner` is what the kid calls HOLLOW at this point of the run (say.ts hollowLabel:
// `???` until it names itself on ship 2, its unit name on every ship after); naming it mid-ship flips
// every hollow block (systems/hollow.ts nameHollow). LOCKED to every tool until ship 5's duel.
function rootSegment(size: number, index: number, owner: string): HollowSegment {
  return {
    id: index === 0 ? 'root' : `root${index + 1}`,
    name: owner,
    type: 'hollow',
    size,
    root: true,
    locked: true,
    owner,
    desc: HOLLOW_DESC.root,
  };
}

// What LAST LIGHT's root leaves when its DELETE completes (WP11, §6.6: "a single last block"): the root's blocks as
// free space with one LAST_BLOCK_SIZE block in their middle (so a WALL stands on each side of it), in its owner's name,
// LOCKED to every tool (PURGE or MERGE decides what becomes of it). Fills exactly the root's width.
export function rootRemains(root: Readonly<HollowSegment>): Segment[] {
  if (!root.root) throw new Error(`rootRemains: ${root.id} is not the root`);
  if (root.size <= LAST_BLOCK_SIZE) throw new Error(`rootRemains: a ${root.size}-block root leaves no room around its last block`);
  const before = Math.floor((root.size - LAST_BLOCK_SIZE) / 2);
  const after = root.size - LAST_BLOCK_SIZE - before;
  const last: HollowSegment = {
    id: newSegId('last'),
    name: root.owner,
    type: 'hollow',
    size: LAST_BLOCK_SIZE,
    root: false,
    locked: true,
    owner: root.owner,
    last: true,
    desc: HOLLOW_DESC.last,
  };
  return [...(before > 0 ? [freeSegment(before)] : []), last, ...(after > 0 ? [freeSegment(after)] : [])];
}

// --- Building a ship's memory -----------------------------------------------------------------------

function isFree<Spec>(item: RackItem<Spec>): item is FreeSpec {
  return typeof item === 'object' && item !== null && 'free' in item;
}

function failFor(ship: ShipDef): (why: string) => never {
  return (why) => { throw new Error(`ShipDef ${ship.id} memory: ${why}`); };
}

// A written rack (A, E, F) as fresh segments; it must fill its rack exactly.
function buildWrittenRack<Spec extends Segment>(
  rack: string, items: readonly RackItem<Spec>[], fail: (why: string) => never,
): Segment[] {
  const segs: Segment[] = items.map((item) => (isFree(item) ? freeSegment(item.free) : structuredClone(item)));
  const sum = segs.reduce((total, seg) => total + seg.size, 0);
  if (sum !== RACK_BLOCKS) fail(`rack ${rack} sums to ${sum}, not ${RACK_BLOCKS}`);
  return segs;
}

// One pod rack's layout as tokens; the drivers and roots are filled in by the caller.
export type LayoutToken = { kind: 'driver' } | { kind: 'root'; size: number } | { kind: 'free'; size: number } | { kind: 'slot' };

export function parseRackLayout(rack: string, layout: string, fail: (why: string) => never): LayoutToken[] {
  const tokens: LayoutToken[] = [];
  for (const word of layout.trim().split(/\s+/)) {
    let match: RegExpExecArray | null;
    if (word === 'P') tokens.push({ kind: 'driver' });
    else if (word === 'S') tokens.push({ kind: 'slot' });
    else if ((match = /^_(\d+)$/.exec(word))) tokens.push({ kind: 'free', size: Number(match[1]) });
    else fail(`unknown token '${word}' in rack ${rack}`);
  }
  const sum = tokens.reduce((total, token) => total + tokenBlocks(token), 0);
  if (tokens.some((token) => (token.kind === 'root' || token.kind === 'free') && !(token.size > 0))) fail(`rack ${rack} has an empty token`);
  if (tokens.filter((token) => token.kind === 'slot').length > 1) fail(`rack ${rack} has more than one root slot`);
  if (sum !== RACK_BLOCKS) fail(`rack ${rack} sums to ${sum}, not ${RACK_BLOCKS}`);
  return tokens;
}

// A layout token's blocks in the static rack sum: the slot is 0 (a root takes its blocks off the rack's trailing free).
function tokenBlocks(token: LayoutToken): number {
  switch (token.kind) {
    case 'driver': return DRIVER_BLOCKS;
    case 'slot': return 0;
    case 'root':
    case 'free': return token.size;
  }
}

// The pod racks a ship has, in address order, each parsed.
export function podRackLayouts(ship: ShipDef): { rack: PodRackKey; tokens: LayoutToken[] }[] {
  const fail = failFor(ship);
  return POD_RACK_KEYS.filter((rack) => ship.memory.podRacks[rack] !== undefined)
    .map((rack) => ({ rack, tokens: parseRackLayout(rack, ship.memory.podRacks[rack], fail) }));
}

// The pod rack that holds the ship's root slot (`S`), or null for a ship HOLLOW can't board (a calm or seeds ship's
// layout, 01-landing §3.16). At most one slot per ship (more would make "where does the root land" an accident).
export function rootSlotRack(ship: ShipDef): PodRackKey | null {
  const racks = podRackLayouts(ship).filter(({ tokens }) => tokens.some((token) => token.kind === 'slot')).map(({ rack }) => rack);
  if (racks.length > 1) failFor(ship)(`root slots in racks ${racks.join(', ')}: a ship has at most one`);
  return racks[0] ?? null;
}

// The largest root this ship's slot must ever hold (04 §3.7, §3.10): a final ship's FINALE root plus a MERGE trace
// (slice 7), PRE_FINAL_ROOT_CAP anywhere else (a stage's root plus what it was fed, capped).
export function maxRootFor(ship: ShipDef): number {
  return ship.flagship ? FINAL_ROOT_MAX_BLOCKS : PRE_FINAL_ROOT_CAP;
}

// The free blocks that close a rack's tokens (the slot's rack gives a root its blocks from there).
function trailingFree(tokens: readonly LayoutToken[]): number {
  let free = 0;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]!;
    if (token.kind !== 'free') break;
    free += token.size;
  }
  return free;
}

// A rack's tokens with the root written into its slot: the slot becomes a root token of `blocks`, and the same blocks
// come off the rack's trailing free, so the rack still sums to RACK_BLOCKS. Without a root the slot is dropped.
function placeRoot(tokens: readonly LayoutToken[], root: { blocks: number } | null, fail: (why: string) => never): LayoutToken[] {
  const out: LayoutToken[] = tokens.filter((token) => token.kind !== 'slot' || root !== null)
    .map((token) => (token.kind === 'slot' && root !== null ? { kind: 'root', size: root.blocks } : { ...token }));
  if (root === null || !tokens.some((token) => token.kind === 'slot')) return out;
  if (!(Number.isInteger(root.blocks) && root.blocks > 0)) fail(`a root of ${root.blocks} blocks`);
  if (trailingFree(tokens) < root.blocks) fail(`the root slot's rack ends in ${trailingFree(tokens)} free blocks, too few for a ${root.blocks}-block root`);
  let left = root.blocks;
  for (let i = out.length - 1; i >= 0 && left > 0; i--) {
    const token = out[i]!;
    if (token.kind !== 'free') break;
    const take = Math.min(left, token.size);
    token.size -= take;
    left -= take;
  }
  return out.filter((token) => token.kind !== 'free' || token.size > 0);
}

// The roles a fresh layout may hold only once (§9: segments are looked up by role, so a second
// Engine I/O in the data would make "which one counts" an accident of order). A carried unit may hold
// copies of its own files (a COPY of Telemetry carries with it, §6.9), so only the ship's roles are
// checked then: the racks it brings are the ship's own data.
function assertSingleRoles(segs: readonly Segment[], fail: (why: string) => never, carried: boolean): void {
  const seen = new Set<SegmentRole>();
  for (const seg of segs) {
    if (!seg.role) continue;
    if (carried && isUnitFileType(seg)) continue;
    if (seen.has(seg.role)) fail(`duplicate role '${seg.role}'`);
    seen.add(seg.role);
  }
}

// The unit's own files: what carries from ship to ship (§6.9): the Core, the AI tools and skills, the
// fs-tools, the upgrade files and FIREWALLs picked between ships, REPAIR CHARGE, and 046.log (05 §3.2: locked in the
// packet). Ship files, drivers and HOLLOW stay.
export function isUnitFileType(seg: Segment): boolean {
  return seg.type === 'core' || seg.type === 'tool' || seg.type === 'skill' || seg.type === 'fs-tool' || seg.type === 'redundancy'
    || seg.type === 'upgrade' || seg.type === 'firewall' || seg.type === 'log';
}

// The unit's own files as they arrive on a later ship (systems/carry.ts packs them): the segments
// from `startAddr` to the end of memory, free fillers included. They start at rack E (256) unless the
// packet was too big for racks E–F, when they spill back into the last pod rack's trailing free blocks
// (§6.9; 01-landing §3.16 caps that tail at UNIT_TAIL_BLOCKS).
export interface CarriedRacks {
  startAddr: number;
  segs: Segment[];
  // Beam seeds that found no room in the receiver (04 §3.4's no-room rule, systems/carry.ts layoutCarried): buildShipMemory
  // lands each in the centre of the largest free region of the whole memory once the ship is built.
  strays?: HollowSegment[];
}

// Rack E's first address: where a unit's own files start (§4.2).
export const UNIT_RACKS_START = RACK_BLOCKS * RACK_NAMES.indexOf('E');

// How many pods a ship's layout holds (the pod racks' `P` tokens).
export function shipPodCount(ship: ShipDef): number {
  return podRackLayouts(ship).reduce((pods, { tokens }) => pods + tokens.filter((token) => token.kind === 'driver').length, 0);
}

// The drivers a ship arrives hurt with on this run live in data/driver-damage.ts (Track OPENING's: the layer's rolled
// damage replaces the reseeding); re-exported here for the callers phase 2 wrote.
export { hurtDriversFor } from '@data/driver-damage';

// The ship's racks A–D as segments, in address order: the ship's own files, then the pod racks (drivers and HOLLOW's
// root in its slot) from the layout strings. `rng` is the ship's families stream; `firstRun` keeps the families the first
// run always meets; `hollowOwner` names the roots; `root` is the root the threat ladder brings (null: none); `hurt` are
// the drivers that arrive hurt.
function buildShipRacks(
  ship: ShipDef, rng: Rng, firstRun: boolean, hollowOwner: string, root: { blocks: number } | null, hurt: readonly HurtDriver[],
  fail: (why: string) => never,
): Segment[] {
  const def = ship.memory;
  const rackA = buildWrittenRack('A', def.rackA, fail);
  damageShipFiles(rackA, ship, fail);
  if (root !== null && rootSlotRack(ship) === null) fail(`a ${root.blocks}-block root, but the layout has no root slot (S)`);
  const layouts = podRackLayouts(ship).map(({ rack, tokens }) => ({ rack, tokens: placeRoot(tokens, root, fail) }));
  const podCount = layouts.reduce((pods, { tokens }) => pods + tokens.filter((token) => token.kind === 'driver').length, 0);
  const drivers = def.drivers;
  for (const driver of hurt) {
    if (driver.pod < 1 || driver.pod > podCount) fail(`hurt pod ${driver.pod} is not one of ${podCount}`);
    if (!(driver.integrity > 0 && driver.integrity < INTEGRITY_MAX)) fail(`hurt integrity ${driver.integrity} is not hurt`);
  }
  if (new Set(hurt.map((driver) => driver.pod)).size !== hurt.length) fail('a pod is listed hurt twice');
  if (drivers.lead < 1 || drivers.lead > podCount) fail(`lead pod ${drivers.lead} is not one of ${podCount}`);
  const roster = rollRoster(podCount, rng, firstRun ? drivers.firstRun : null);
  // A later run of a ship whose first run is written (§5.2: the lead pod keeps a featured colonist): the families are
  // reseeded, and the lead pod's first colonist (first in the credits) is a child, the way Ada was. Drawn last, so the
  // rest of the roster is the seed's as before.
  if (!firstRun && drivers.firstRun !== null) {
    const lead = roster[drivers.lead - 1]?.featured[0];
    if (!lead) fail(`lead pod ${drivers.lead} has no colonist to feature`);
    lead.age = rollChildAge(rng);
  }

  let podIndex = 0;
  let rootIndex = 0;
  const podRacks: Segment[] = [];
  for (const { tokens } of layouts) {
    for (const token of tokens) {
      if (token.kind === 'free') { podRacks.push(freeSegment(token.size)); continue; }
      if (token.kind === 'root') { podRacks.push(rootSegment(token.size, rootIndex++, hollowOwner)); continue; }
      if (token.kind === 'slot') return fail('a root slot left after placeRoot');
      const pod = podIndex + 1;
      const people = roster[podIndex++]!;
      const integrity = hurt.find((driver) => driver.pod === pod)?.integrity ?? INTEGRITY_MAX;
      const driver: DriverSegment = {
        id: driverSegId(pod),
        name: driverName(pod, people.family),
        type: 'driver',
        size: DRIVER_BLOCKS,
        integrity,
        state: integrityState(integrity),
        pod,
        family: people.family,
        colonists: COLONISTS_PER_POD,
        featured: people.featured,
      };
      podRacks.push(driver);
    }
  }
  return [...rackA, ...podRacks];
}

// The ship's own files that arrive damaged (§6.9, WP10: VESPER's Thrust Ctrl at 31%; "rack A belongs to the ship"):
// built so, scanned or not (a ship file hides its health until scanned, §3.2). A rule for a role rack A does not hold
// is the unit's file (KESTREL's Sensor Interp), which systems/carry.ts cuts on arrival; a role the ship holds twice
// would make "which copy" an accident, so it throws.
function damageShipFiles(rackA: Segment[], ship: ShipDef, fail: (why: string) => never): void {
  for (const rule of ship.arrival?.damage ?? []) {
    const files = rackA.filter((seg) => seg.role === rule.role && (seg.type === 'ship' || seg.type === 'ship-backup'));
    if (files.length > 1) fail(`arrival damage to '${rule.role}' matches ${files.length} ship files`);
    const file = files[0];
    if (!file || (file.type !== 'ship' && file.type !== 'ship-backup')) continue;
    file.integrity = Math.min(file.integrity, rule.maxIntegrity);
    file.state = integrityState(file.integrity);
  }
}

// The free blocks at the very end of the ship's last pod rack (§6.9, 01-landing §3.16: the room an oversized packet may
// spill back into before rack E). Pure layout: the free tokens that close the last pod rack's string, less the largest
// root the slot may hold when the slot is in that rack (the root takes its blocks from there; slice 3's smaller classes).
export function lastPodRackTrailingFree(ship: ShipDef): number {
  const last = podRackLayouts(ship).at(-1);
  if (!last) throw new Error(`lastPodRackTrailingFree ${ship.id}: the ship has no pod rack`);
  const slotHere = last.tokens.some((token) => token.kind === 'slot');
  return Math.max(0, trailingFree(last.tokens) - (slotHere ? maxRootFor(ship) : 0));
}

// The colonists a ship carries (01-landing §3.5: the LZ counts sum to everyone aboard), from its landing data alone: the
// TRANSMIT screen names the next ship's before it is built, and RUN END totals the fleet.
export function shipColonists(ship: ShipDef): number {
  return ship.landing.lzs.reduce((sum, lz) => sum + lz.pods, 0) * COLONISTS_PER_POD;
}

// Throws on pod racks that break 01-landing §3.16's budget, run for every ship at load (data/ships.ts):
// • at least POD_RACK_MIN_FREE free blocks across the pod racks, not counting the root's GAPs (free tokens shorter than
//   WALL_MIN_BLOCKS right next to the `S` slot) nor the largest root the slot may hold (maxRootFor), so walls
//   and MOVEs always have room;
// • a slot's rack ends in at least maxRootFor free blocks: the root takes its blocks from there (slice-2-plan §4);
// • at least UNIT_TAIL_BLOCKS trailing free in the last pod rack: the tail the unit may spill into;
// • one driver per pod, the pods summing to the LZ counts.
// It walks the racks the ship has, so slice 3's smaller classes need no change here.
export function validatePodRacks(ship: ShipDef): void {
  const fail = failFor(ship);
  let free = 0;
  for (const { tokens } of podRackLayouts(ship)) {
    tokens.forEach((token, index) => {
      if (token.kind !== 'free') return;
      const isRoot = (near: LayoutToken | undefined): boolean => near?.kind === 'root' || near?.kind === 'slot';
      const nextToRoot = isRoot(tokens[index - 1]) || isRoot(tokens[index + 1]);
      if (nextToRoot && token.size < WALL_MIN_BLOCKS) return;
      free += token.size;
    });
  }
  const slot = rootSlotRack(ship);
  if (slot !== null) {
    const tokens = podRackLayouts(ship).find(({ rack }) => rack === slot)!.tokens;
    if (trailingFree(tokens) < maxRootFor(ship)) fail(`rack ${slot}'s root slot needs ${maxRootFor(ship)} trailing free blocks, it has ${trailingFree(tokens)}`);
    free -= maxRootFor(ship);
  }
  if (free < POD_RACK_MIN_FREE) fail(`the pod racks hold ${free} free blocks (root gaps and the largest root not counted), under ${POD_RACK_MIN_FREE}`);
  const tail = lastPodRackTrailingFree(ship);
  if (tail < UNIT_TAIL_BLOCKS) fail(`the last pod rack ends in ${tail} free blocks, under the unit's ${UNIT_TAIL_BLOCKS}-block tail`);
  const pods = shipPodCount(ship);
  const lzPods = ship.landing.lzs.reduce((sum, lz) => sum + lz.pods, 0);
  if (pods !== lzPods) fail(`${pods} drivers in the pod racks, but the LZ counts sum to ${lzPods} pods`);
}

// Cuts `blocks` free blocks off the end of `segs` (racks A–D): the room a spilled packet takes. They
// must be free (lastPodRackTrailingFree checked it when the packet was laid out); anything else throws.
function trimTrailingFree(segs: Segment[], blocks: number, fail: (why: string) => never): void {
  let left = blocks;
  while (left > 0) {
    const last = segs[segs.length - 1];
    if (!last || last.type !== 'free') return fail(`the carried files spill ${blocks} blocks into the last pod rack, but its tail is not free`);
    if (last.size <= left) {
      left -= last.size;
      segs.pop();
    } else {
      last.size -= left;
      left = 0;
    }
  }
}

// The ship's memory as segments, in address order (§4.2, §9 WP5 item 1). `rng` is the ship's families
// stream (drivers.familiesSeedStream); `firstRun` keeps the families the first run always meets (the
// run-1 ARES-VII of §6.7). `carried` is the unit's own files from the last ship (systems/carry.ts packs
// them: racks E–F, maybe spilling into the last pod rack); a fresh unit (ship 1) uses the ship's written aiFiles,
// and a ship with written aiFiles never takes carried ones (ship 1 always meets a fresh unit). Throws
// on a rack that does not fill 64 blocks, an unknown layout token, a role written twice, a name too
// long, no owner, or a ship whose racks E–F have no source. `root` is HOLLOW's root as the threat ladder brings it
// (systems/threat-plan.ts ShipThreat.rootBlocks; slice 2's THREAT track carries it in the Packet): written into the
// layout's `S` slot, and a root on a ship with no slot throws; null on a ship HOLLOW is not aboard. `hurt` are the
// drivers that arrive hurt on this run (state/initial.ts passes hurtDriversFor's); left out, the ship's written ones
// (the layout suites).
export function buildShipMemory(
  ship: ShipDef, carried: CarriedRacks | null, rng: Rng, firstRun: boolean, hollowOwner: string, root: { blocks: number } | null,
  hurt: readonly HurtDriver[] = ship.memory.drivers.hurt,
): Segment[] {
  const fail = failFor(ship);
  if (typeof hollowOwner !== 'string' || hollowOwner === '') fail('HOLLOW\'s root needs an owner name (say.ts hollowLabel)');
  const aiFiles = ship.memory.aiFiles;
  const shipRacks = buildShipRacks(ship, rng, firstRun, hollowOwner, root, hurt, fail);
  let unitRacks: Segment[];
  if (carried === null) {
    if (!aiFiles) return fail('a ship without written racks E–F (aiFiles) needs the unit\'s carried files');
    unitRacks = [...buildWrittenRack('E', aiFiles.E, fail), ...buildWrittenRack('F', aiFiles.F, fail)];
  } else {
    if (aiFiles) return fail('this ship meets a fresh unit (it has written racks E–F): nothing is carried to it');
    if (carried.startAddr > UNIT_RACKS_START) fail(`carried files start at ${carried.startAddr}, after rack E`);
    trimTrailingFree(shipRacks, UNIT_RACKS_START - carried.startAddr, fail);
    unitRacks = carried.segs.map((seg) => structuredClone(seg));
  }
  const memory = [...shipRacks, ...unitRacks];
  assertSingleRoles(memory, fail, carried !== null);
  for (const seg of memory) {
    if (seg.name.length > SEG_NAME_MAX_CHARS) fail(`'${seg.name}' is longer than ${SEG_NAME_MAX_CHARS} chars`);
  }
  // Free space written at the end of one rack and the start of the next is one gap in memory
  // (rack B's tail and the empty racks C–D on ship 1).
  mergeAdjacentFree(memory);
  for (const stray of carried?.strays ?? []) landStray(memory, structuredClone(stray), fail);
  assertMemoryInvariants(memory, MEMORY_TOTAL_BLOCKS);
  return memory;
}

// A beam seed with no room in the receiver (04 §3.4's no-room rule, a designed rule): it lands in the centre of the
// largest free region (the lowest address of equal ones). Throws when no free region takes it.
function landStray(memory: Segment[], seed: HollowSegment, fail: (why: string) => never): void {
  let best = -1;
  memory.forEach((seg, index) => {
    if (seg.type === 'free' && seg.size >= seed.size && (best < 0 || seg.size > memory[best]!.size)) best = index;
  });
  if (best < 0) fail(`no free region takes a ${seed.size}-block beam seed`);
  const region = memory[best]!;
  const left = Math.floor((region.size - seed.size) / 2);
  const right = region.size - seed.size - left;
  memory.splice(best, 1, ...(left > 0 ? [freeSegment(left)] : []), seed, ...(right > 0 ? [freeSegment(right)] : []));
}

// --- Racks on screen ---------------------------------------------------------------------------------

// The rack an address is in: 0x000–0x03F is A, 0x040–0x07F is B, …
export function rackOf(addr: number): string {
  const rack = RACK_NAMES[Math.floor(addr / RACK_BLOCKS)];
  if (rack === undefined) throw new Error(`rackOf: address ${addr} is outside the ${MEMORY_TOTAL_BLOCKS}-block strip`);
  return rack;
}

// An address as the strip prints it: 0x000 … 0x17F.
export function hexAddr(addr: number): string {
  return '0x' + addr.toString(16).padStart(3, '0').toUpperCase();
}

// The strip's label for the rack that starts at `addr` (§9 WP5 item 5): `RACK C` over `0x080`.
// MemoryStrip draws the two parts stacked; rackLabel is the same label as one line of text.
export function rackLabelParts(addr: number): { name: string; addr: string } {
  if (addr % RACK_BLOCKS !== 0) throw new Error(`rackLabel: ${hexAddr(addr)} is not the start of a rack`);
  return { name: `RACK ${rackOf(addr)}`, addr: hexAddr(addr) };
}

export const RACK_LABEL_SEP = ' · ';

export function rackLabel(addr: number): string {
  const parts = rackLabelParts(addr);
  return `${parts.name}${RACK_LABEL_SEP}${parts.addr}`;
}

// The racks that hold any of `segs`, as a kid reads them: `RACK C`, `RACKS B–C`, `RACKS B–D`.
export function racksLabel(memory: readonly Segment[], segs: readonly Segment[]): string {
  const starts = segmentStarts(memory);
  const racks = new Set<number>();
  segs.forEach((seg) => {
    const index = memory.indexOf(seg);
    if (index < 0) throw new Error(`racksLabel: ${seg.name} is not in memory`);
    racks.add(Math.floor(starts[index]! / RACK_BLOCKS));
    racks.add(Math.floor((starts[index]! + seg.size - 1) / RACK_BLOCKS));
  });
  const sorted = [...racks].sort((a, b) => a - b);
  if (sorted.length === 0) throw new Error('racksLabel: no segments');
  const first = RACK_NAMES[sorted[0]!]!;
  const last = RACK_NAMES[sorted[sorted.length - 1]!]!;
  return first === last ? `RACK ${first}` : `RACKS ${first}–${last}`;
}
