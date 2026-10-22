import type {
  Segment, ShipSegment, ShipBackupSegment, CoreSegment, ToolSegment, SkillSegment, FsToolSegment,
  RedundancySegment, SoulSegment, HollowSegment, SegmentRole,
} from '@/types/segment';
import type { ShipDef } from '@data/ships';
import type { Rng } from '@systems/rng';
import { assertMemoryInvariants, freeSegment, mergeAdjacentFree, segmentStarts, newSegId } from '@systems/memory-ops';
import { createToolFiles } from '@data/fs-tools';
import { rollRoster, rollChildAge, type ScriptedRoster } from '@data/souls';
import {
  SEG_NAME_MAX_CHARS, RACK_BLOCKS, RACK_COUNT, CLUSTER_BLOCKS, ROOT_BLOCKS, SOULS_PER_CLUSTER, INTEGRITY_MAX, LAST_BLOCK_SIZE,
} from '@data/tuning';
import { integrityState } from '@state/selectors';
import { HOLLOW_DESC } from '@data/hollow-text';

// The ship's memory (§3.2, §4.2): 384 blocks in 6 RACKS of 64, built from ship data.
//   A    the ship's files (the same on every ship)
//   B–D  the SOUL ARCHIVE and HOLLOW's root, from a layout string per ship
//   E    your AI files            F  your filesystem tools and REPAIR CHARGE
// Racks are places: debris hits RACK C, the belt racks A–B, and the address labels name them. A
// segment's address is the running sum of the sizes before it (systems/memory-ops.ts); a rack is
// address / 64. Every visible file either does something or says it doesn't (§8). The AI's own
// files (Core, tools, fs-tools) are always visible; ship files hide their health until scanned,
// and on ship 1 the archive arrives as sealed grey slabs until the STASIS reveal.

export const MEMORY_TOTAL_BLOCKS = RACK_BLOCKS * RACK_COUNT;
export const RACK_NAMES: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'F'];

// A run of free blocks in a written rack.
export interface FreeSpec {
  free: number;
}

export type ShipFileSpec = ShipSegment | ShipBackupSegment;
export type AiFileSpec = CoreSegment | ToolSegment | SkillSegment | FsToolSegment | RedundancySegment;
export type RackItem<Spec> = Spec | FreeSpec;

// A cluster that arrives hurt (§5.1: C09 at 71%). Cluster numbers are 1-based, as on screen (C09 → 9).
export interface HurtCluster {
  cluster: number;
  integrity: number;
}

// The soul archive's people on one ship (§6.7). Cluster numbers are 1-based, as on screen (C09 → 9).
export interface ShipSoulsDef {
  familiesSeedStream: string;          // childRng stream for the seeded families and colonists
  // The cluster that arrives hurt (§5.1: C09 at 71%), or null when every cluster arrives whole. On a later
  // run of a ship whose first run is written (firstRun below), the hurt cluster is reseeded (hurtClusterFor).
  hurt: HurtCluster | null;
  lead: number;                        // the story's cluster: selected at the reveal, first in the credits
  sealed: boolean;                     // the archive arrives as sealed slabs (ship 1: the STASIS reveal)
  firstRun: ScriptedRoster | null;     // the families and lead colonist the first run always meets
}

export interface ShipMemoryDef {
  rackA: readonly RackItem<ShipFileSpec>[];
  // Racks B–D as layout strings (§4.2): `C` an 8-block soul cluster, `R` the 8-block root (`R16`:
  // 16 blocks), `_n` n free blocks; space-separated, each rack summing to RACK_BLOCKS.
  racksBD: { B: string; C: string; D: string };
  // Racks E and F as written for a unit that arrives fresh (ship 1). Later ships hold whatever the
  // unit carried (systems/carry.ts), so theirs is null.
  aiFiles: { E: readonly RackItem<AiFileSpec>[]; F: readonly RackItem<AiFileSpec>[] } | null;
  souls: ShipSoulsDef;
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
  // The reveal's pointer (§1): its scan says where the colonists really are (systems/reveal.ts).
  { id: 'stasis', name: 'Stasis', type: 'ship', role: 'stasis', size: 4, integrity: 100, scanned: false,
    desc: 'Built to hold the colonists\' sleeping pods. 0 pods detected: the colonists are files, in this memory. No flight effect.' },
  { id: 'printer', name: 'Printer Uplink', type: 'ship', role: 'printer', size: 6, integrity: 100, scanned: false,
    desc: 'Talks to the bio-printers on the surface. Damage slows printing; without it nothing prints.' },
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
  // REPAIR CHARGE (the old Quantum Redundancy pool): spent by repairs, one point at a time.
  { id: 'redund', name: 'Repair Charge', type: 'redundancy', role: 'redundancy', size: 36, used: 36, capacity: 72,
    desc: 'Transmitted alongside the AI. Every point a Repair heals costs charge (bigger files cost more). Spent blocks stay empty until Repair v2 squeezes them out; when the last point is spent the blocks become free space. Deleting it frees the space and loses the charge.' },
  { free: 25 },
];

const FRESH_CHARGE_FILE: RedundancySegment = (() => {
  const charge = FRESH_UNIT_RACK_F.find((item): item is RedundancySegment => !('free' in item) && item.type === 'redundancy');
  if (!charge) throw new Error('memory: a fresh unit has no REPAIR CHARGE');
  return charge;
})();

// The REPAIR CHARGE a fresh unit is sent with (§6.5: 36 on ship 1): what HALCYON's HOLLOW says it was
// sent with too (`> hello 047. they sent me with 36 blocks of charge too.`).
export const FRESH_UNIT_CHARGE: number = FRESH_CHARGE_FILE.used;

// A copy of the fresh unit's REPAIR CHARGE file. A unit that spent its last point has no pool left (the
// blocks became free space), but its arrival still brings the floor and the star credit (§6.5), so the
// arrival writes the pool again from this one (systems/carry.ts).
export function freshChargeFile(): RedundancySegment {
  return structuredClone(FRESH_CHARGE_FILE);
}

// --- The root: HOLLOW's first block (§6.6) ----------------------------------------------------------

// The `R` token. `owner` is what the kid calls HOLLOW at this point of the run (say.ts hollowLabel:
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

// One rack of the B–D layout as tokens; the clusters and roots are filled in by the caller.
type LayoutToken = { kind: 'cluster' } | { kind: 'root'; size: number } | { kind: 'free'; size: number };

export function parseRackLayout(rack: string, layout: string, fail: (why: string) => never): LayoutToken[] {
  const tokens: LayoutToken[] = [];
  for (const word of layout.trim().split(/\s+/)) {
    let match: RegExpExecArray | null;
    if (word === 'C') tokens.push({ kind: 'cluster' });
    else if (word === 'R') tokens.push({ kind: 'root', size: ROOT_BLOCKS });
    else if ((match = /^R(\d+)$/.exec(word))) tokens.push({ kind: 'root', size: Number(match[1]) });
    else if ((match = /^_(\d+)$/.exec(word))) tokens.push({ kind: 'free', size: Number(match[1]) });
    else fail(`unknown token '${word}' in rack ${rack}`);
  }
  const sum = tokens.reduce((total, token) => total + (token.kind === 'cluster' ? CLUSTER_BLOCKS : token.size), 0);
  if (tokens.some((token) => token.kind !== 'cluster' && !(token.size > 0))) fail(`rack ${rack} has an empty token`);
  if (sum !== RACK_BLOCKS) fail(`rack ${rack} sums to ${sum}, not ${RACK_BLOCKS}`);
  return tokens;
}

export function clusterCode(number: number): string {
  return `C${String(number).padStart(2, '0')}`;
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
// fs-tools, the upgrade files and FIREWALLs picked between ships, REPAIR CHARGE. Ship files, souls and
// HOLLOW stay.
export function isUnitFileType(seg: Segment): boolean {
  return seg.type === 'core' || seg.type === 'tool' || seg.type === 'skill' || seg.type === 'fs-tool' || seg.type === 'redundancy'
    || seg.type === 'upgrade' || seg.type === 'firewall';
}

// The unit's own files as they arrive on a later ship (systems/carry.ts packs them): the segments
// from `startAddr` to the end of memory, free fillers included. They start at rack E (256) unless the
// packet was too big for racks E–F, when they spill back into rack D's trailing free blocks (§6.9).
export interface CarriedRacks {
  startAddr: number;
  segs: Segment[];
}

// Rack E's first address: where a unit's own files start (§4.2).
export const UNIT_RACKS_START = RACK_BLOCKS * RACK_NAMES.indexOf('E');

// How many soul clusters a ship's layout holds (racks B–D's `C` tokens).
export function shipClusterCount(ship: ShipDef): number {
  let clusters = 0;
  for (const rack of ['B', 'C', 'D'] as const) {
    clusters += parseRackLayout(rack, ship.memory.racksBD[rack], failFor(ship)).filter((token) => token.kind === 'cluster').length;
  }
  return clusters;
}

// The cluster a ship arrives with hurt on this run (§5.1, §5.2). The ship's written one, except on a later
// run of a ship whose first run is written (ARES-VII): its families are reseeded, and so is the hurt
// cluster, drawn from `rng` (its own stream) among every cluster but the lead (C12 keeps HOLLOW's bite).
export function hurtClusterFor(ship: ShipDef, firstRun: boolean, rng: Rng): HurtCluster | null {
  const written = ship.memory.souls.hurt;
  if (written === null || firstRun || ship.memory.souls.firstRun === null) return written;
  const candidates: number[] = [];
  for (let number = 1; number <= shipClusterCount(ship); number++) if (number !== ship.memory.souls.lead) candidates.push(number);
  const cluster = candidates[Math.floor(rng() * candidates.length)];
  if (cluster === undefined) throw new Error(`hurtClusterFor ${ship.id}: no cluster besides the lead to hurt`);
  return { cluster, integrity: written.integrity };
}

// The ship's racks A–D as segments, in address order: the ship's own files, then the SOUL ARCHIVE and
// HOLLOW's root from the layout strings. `rng` is the ship's families stream; `firstRun` keeps the
// families the first run always meets; `hollowOwner` names the roots; `hurt` is the cluster that arrives hurt.
function buildShipRacks(
  ship: ShipDef, rng: Rng, firstRun: boolean, hollowOwner: string, hurt: HurtCluster | null, fail: (why: string) => never,
): Segment[] {
  const def = ship.memory;
  const rackA = buildWrittenRack('A', def.rackA, fail);
  damageShipFiles(rackA, ship, fail);
  const layouts = { B: parseRackLayout('B', def.racksBD.B, fail), C: parseRackLayout('C', def.racksBD.C, fail), D: parseRackLayout('D', def.racksBD.D, fail) };
  const clusterCount = [...layouts.B, ...layouts.C, ...layouts.D].filter((token) => token.kind === 'cluster').length;
  const souls = def.souls;
  if (hurt !== null) {
    if (hurt.cluster < 1 || hurt.cluster > clusterCount) fail(`hurt cluster ${hurt.cluster} is not one of ${clusterCount}`);
    if (!(hurt.integrity > 0 && hurt.integrity < INTEGRITY_MAX)) fail(`hurt integrity ${hurt.integrity} is not hurt`);
  }
  if (souls.lead < 1 || souls.lead > clusterCount) fail(`lead cluster ${souls.lead} is not one of ${clusterCount}`);
  const roster = rollRoster(clusterCount, rng, firstRun ? souls.firstRun : null);
  // A later run of a ship whose first run is written (§5.2: "C12 keeps a featured colonist"): the families are
  // reseeded, and the lead cluster's first colonist (named at the reveal, first in the credits) is a child,
  // the way Ada was. Drawn last, so the rest of the roster is the seed's as before.
  if (!firstRun && souls.firstRun !== null) {
    const lead = roster[souls.lead - 1]?.featured[0];
    if (!lead) fail(`lead cluster ${souls.lead} has no colonist to feature`);
    lead.age = rollChildAge(rng);
  }

  let clusterIndex = 0;
  let rootIndex = 0;
  const archive: Segment[] = [];
  for (const rack of ['B', 'C', 'D'] as const) {
    for (const token of layouts[rack]) {
      if (token.kind === 'free') { archive.push(freeSegment(token.size)); continue; }
      if (token.kind === 'root') { archive.push(rootSegment(token.size, rootIndex++, hollowOwner)); continue; }
      const number = clusterIndex + 1;
      const people = roster[clusterIndex++]!;
      const integrity = hurt !== null && number === hurt.cluster ? hurt.integrity : INTEGRITY_MAX;
      const code = clusterCode(number);
      const soul: SoulSegment = {
        id: `soul_${code.toLowerCase()}`,
        name: `${code} · ${people.family}`,
        type: 'soul',
        size: CLUSTER_BLOCKS,
        integrity,
        state: integrityState(integrity),
        cluster: code,
        family: people.family,
        souls: SOULS_PER_CLUSTER,
        featured: people.featured,
        sealed: souls.sealed,
      };
      archive.push(soul);
    }
  }
  return [...rackA, ...archive];
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

// The free blocks at the very end of the ship's rack D (§6.9: the room an oversized packet may spill
// back into before rack E). Pure layout: the free tokens that close the D string.
export function rackDTrailingFree(ship: ShipDef): number {
  const tokens = parseRackLayout('D', ship.memory.racksBD.D, failFor(ship));
  let free = 0;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]!;
    if (token.kind !== 'free') break;
    free += token.size;
  }
  return free;
}

// The colonists a ship carries (§4.2: 2,000 on HALCYON), from its layout alone: the TRANSMIT screen
// names the next ship's before it is built, and RUN END totals the fleet.
export function shipSouls(ship: ShipDef): number {
  return shipClusterCount(ship) * SOULS_PER_CLUSTER;
}

// Cuts `blocks` free blocks off the end of `segs` (racks A–D): the room a spilled packet takes. They
// must be free (rackDTrailingFree checked it when the packet was laid out); anything else throws.
function trimTrailingFree(segs: Segment[], blocks: number, fail: (why: string) => never): void {
  let left = blocks;
  while (left > 0) {
    const last = segs[segs.length - 1];
    if (!last || last.type !== 'free') return fail(`the carried files spill ${blocks} blocks into rack D, but its tail is not free`);
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
// stream (souls.familiesSeedStream); `firstRun` keeps the families the first run always meets (the
// run-1 ARES-VII of §6.7). `carried` is the unit's own files from the last ship (systems/carry.ts packs
// them: racks E–F, maybe spilling into rack D); a fresh unit (ship 1) uses the ship's written aiFiles,
// and a ship with written aiFiles never takes carried ones (ship 1 always meets a fresh unit). Throws
// on a rack that does not fill 64 blocks, an unknown layout token, a role written twice, a name too
// long, no owner, or a ship whose racks E–F have no source. `hurt` is the cluster that arrives hurt on this
// run (state/initial.ts passes hurtClusterFor's); left out, the ship's written one (the layout suites).
export function buildShipMemory(
  ship: ShipDef, carried: CarriedRacks | null, rng: Rng, firstRun: boolean, hollowOwner: string,
  hurt: HurtCluster | null = ship.memory.souls.hurt,
): Segment[] {
  const fail = failFor(ship);
  if (typeof hollowOwner !== 'string' || hollowOwner === '') fail('HOLLOW\'s root needs an owner name (say.ts hollowLabel)');
  const aiFiles = ship.memory.aiFiles;
  const shipRacks = buildShipRacks(ship, rng, firstRun, hollowOwner, hurt, fail);
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
  // (rack C's tail and the empty rack D on ship 1).
  mergeAdjacentFree(memory);
  assertMemoryInvariants(memory, MEMORY_TOTAL_BLOCKS);
  return memory;
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
