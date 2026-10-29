import type { Segment, RedundancySegment, SegmentRole } from '@/types/segment';
import type { TransitHit } from '@state/schema';
import type { ShipDef, ArrivalDamage } from '@data/ships';
import type { Rng } from '@systems/rng';
import { freeSegment, newSegId } from '@systems/memory-ops';
import { hasIntegrity, type HealthSegment } from '@state/selectors';
import { setIntegrity } from '@state/actions';
import { FS_TOOL_KINDS } from '@data/fs-tools';
import {
  UNIT_RACKS_START, MEMORY_TOTAL_BLOCKS, RACK_NAMES, FRESH_UNIT_RACK_E, FRESH_UNIT_RACK_F, lastPodRackTrailingFree, isUnitFileType,
  freshChargeFile, type CarriedRacks,
} from '@data/memory';
import {
  RACK_BLOCKS, TRANSIT_HIT_MIN, TRANSIT_HIT_MAX, TRANSIT_LAST_COPY_FLOOR, TRANSIT_CORE_MAX_HIT, CORE_RESET_INTEGRITY,
  CHARGE_ARRIVAL_FLOOR, UNIT_TAIL_BLOCKS,
} from '@data/tuning';

// Transmission and carry (§6.9), pure and DOM-free: what of the unit crosses the link to the next
// ship, and what the crossing does to it. systems/run.ts calls these in order at TRANSMIT:
// 1. packUnit: the unit's own files (Core, AI tools, skills, upgrade files, fs-tools, FIREWALLs, REPAIR
//    CHARGE) are copied out of memory with their integrity and infection (never a recoil: AI time starts
//    over), plus the file a card picked at this TRANSMIT adds (WP8, systems/draft.ts). Files are packed
//    in a fixed order, rack E first (the Core, the AI tools by role, upgrades and skills), then rack F
//    (the fs-tools by kind, FIREWALLs, then REPAIR CHARGE), and the charge fills what the link has left:
//    carried = min(charge, link − files). Dropped files stay behind; the Core, Engine I/O, Nav Plotter
//    and the last copy of each tool kind can't be dropped.
// 2. rollTransitHits: seeded hits (childRng(seed, next ship, 'transit')) on the packed files, weighted
//    by size, 15–35 each. The best copy of every tool kind (an fs-tool kind or an AI tool's role) never
//    drops below 60, and the Core takes at most 15 per hit and never drops below its emergency reset
//    (25). A crash adds 3 hits and Core −25, BEAM OUT 2 hits (run.ts passes them in).
// 3. arrivalCharge: +6 per ★ of the last ship, +12 for the charge card, and never fewer than 12 blocks
//    (§6.5's floor).
// 4. layoutCarried: the files back into memory, 01-landing §3.16's pooled receiver: rack E's list and rack F's
//    list as one block from rack E's start, then the charge; a block longer than the receiver spills backward
//    into the last pod rack's tail (at most UNIT_TAIL_BLOCKS), and REPAIR CHARGE that still does not fit is lost,
//    loudly (any other overflow throws). A unit that spent its last point of charge before TRANSMIT has no pool
//    file left: its arrival charge is written into a fresh one (the floor is a guarantee).
// 5. arrivalDamage: the ship's own scripted damage (KESTREL, VESPER), named like a hit.

// The order rack E is packed in (§6.9): the Core, then the AI tools by their job.
const RACK_E_ROLE_ORDER: readonly SegmentRole[] = ['core', 'engine-io', 'autopilot', 'sensor', 'navplot', 'telemetry', 'comms'];

export const RACK_E_START = UNIT_RACKS_START;
export const RACK_F_START = RACK_BLOCKS * RACK_NAMES.indexOf('F');

// The unit's own live files in memory, in address order: what can cross the link.
export function unitFilesIn(memory: readonly Segment[]): Segment[] {
  return memory.filter(isUnitFileType);
}

// The kind a file belongs to for "the last copy of each kind" (§6.9): an fs-tool by its tool kind, an
// AI tool or the Core by its role; skills and charge have none.
export function toolKindOf(seg: Segment): string | null {
  if (seg.type === 'fs-tool') return `fs:${seg.fsTool}`;
  if ((seg.type === 'tool' || seg.type === 'core') && seg.role) return `role:${seg.role}`;
  return null;
}

// Why a packed file can't be left behind (§6.9: locked chips), or null when it can. The Core is you,
// Engine I/O and Nav Plotter are the ship's must-haves, and the last copy of each filesystem tool kind
// is the tool itself (its chip would be gone for the rest of the run). The other AI tools (Telemetry,
// Autopilot, Sensor Interp, AI Comms) can stay behind with their consequence on the chip: §6.9's own
// examples (`Autopilot → no W/A/S/D presets`, `AI Comms → no BEAM OUT; a crash ends the run`). REPAIR
// CHARGE is never "dropped": it fills whatever the files leave. `files` is the unit's files that are
// still going (dropping one copy of Repair makes the other its last).
export type DropLock = 'core' | 'engine' | 'navplot' | 'last-copy' | 'charge';

export function dropLock(files: readonly Segment[], seg: Segment): DropLock | null {
  if (seg.type === 'core') return 'core';
  if (seg.type === 'redundancy') return 'charge';
  if (seg.role === 'engine-io') return 'engine';
  if (seg.role === 'navplot') return 'navplot';
  if (seg.type !== 'fs-tool') return null;
  const kind = toolKindOf(seg);
  return files.filter((file) => toolKindOf(file) === kind).length === 1 ? 'last-copy' : null;
}

function rackESortKey(seg: Segment): number {
  const roleIndex = seg.role ? RACK_E_ROLE_ORDER.indexOf(seg.role) : -1;
  // Files with no listed role (skills, upgrades) go after every AI tool.
  return roleIndex >= 0 ? roleIndex : RACK_E_ROLE_ORDER.length;
}

// Rack F: the fs-tools by kind, then FIREWALLs (§6.9).
function rackFSortKey(seg: Segment): number {
  return seg.type === 'fs-tool' ? FS_TOOL_KINDS.indexOf(seg.fsTool) : FS_TOOL_KINDS.length;
}

function packsInRackF(seg: Segment): boolean {
  return seg.type === 'fs-tool' || seg.type === 'firewall';
}

// A packed copy of a file: integrity and infection travel, the op flags and the recoil do not.
function packedCopy(seg: Segment): Segment {
  const copy = structuredClone(seg);
  delete copy.operating;
  if (hasIntegrity(copy)) delete copy.recoilUntilAi;
  return copy;
}

export interface Packet {
  linkBlocks: number;
  rackE: Segment[];         // packed copies, in rack-E order
  rackF: Segment[];         // packed fs-tools, in rack-F order (REPAIR CHARGE apart, below)
  charge: RedundancySegment | null;  // the charge's packed copy (null: the unit has none left)
  filesBlocks: number;      // the files' blocks, charge excluded
  chargeHeld: number;       // the charge the unit had at TRANSMIT
  chargeCarried: number;    // what crosses: min(charge, link − files)
}

// Packs the unit for a link of `linkBlocks` (step 1 of the header). Copies only: memory is not touched.
// `added` is the picked card's new file (systems/draft.ts cardFiles), packed with the rest; none when the
// card brings no file. Throws on a drop that is locked, an unknown id, and on files that do not fit the
// link at all (the TRANSMIT screen asks the kid to drop some first; WP7 part 2).
export function packUnit(memory: readonly Segment[], linkBlocks: number, dropped: readonly string[], added: readonly Segment[] = []): Packet {
  const live = unitFilesIn(memory);
  const kept = live.filter((seg) => !dropped.includes(seg.id));
  for (const id of dropped) {
    const seg = live.find((file) => file.id === id);
    if (!seg) throw new Error(`packUnit: dropped file ${id} is not one of the unit's files`);
    // Judged against what still goes: dropping Repair and Repair.bak both would leave no REPAIR.
    const lock = dropLock([...kept, seg], seg);
    if (lock !== null) throw new Error(`packUnit: ${seg.name} can't be left behind (${lock})`);
  }
  const charges = kept.filter((seg): seg is RedundancySegment => seg.type === 'redundancy');
  if (charges.length > 1) throw new Error(`packUnit: ${charges.length} REPAIR CHARGE segments in memory (there is one pool)`);
  if (added.some((seg) => !isUnitFileType(seg) || seg.type === 'redundancy')) throw new Error('packUnit: a card can only add a unit file');
  const files = [...kept.filter((seg) => seg.type !== 'redundancy'), ...added];
  // Stable sorts: copies of one kind keep their address order, so the original stays first (and a card's
  // new file goes after the ones the unit already had).
  const rackE = files.filter((seg) => !packsInRackF(seg)).sort((a, b) => rackESortKey(a) - rackESortKey(b)).map(packedCopy);
  const rackF = files.filter(packsInRackF).sort((a, b) => rackFSortKey(a) - rackFSortKey(b)).map(packedCopy);
  const filesBlocks = [...rackE, ...rackF].reduce((sum, seg) => sum + seg.size, 0);
  if (filesBlocks > linkBlocks) throw new Error(`packUnit: the files take ${filesBlocks} blocks, the link carries ${linkBlocks}`);
  const held = charges[0] ?? null;
  const chargeHeld = held ? held.used : 0;
  const chargeCarried = Math.max(0, Math.min(chargeHeld, linkBlocks - filesBlocks));
  const charge = held ? packedCopy(held) as RedundancySegment : null;
  return { linkBlocks, rackE, rackF, charge, filesBlocks, chargeHeld, chargeCarried };
}

// Every packed file a hit can land on (charge is not a file: §6.9 hits "packed non-charge files").
export function packedFiles(packet: Packet): Segment[] {
  return [...packet.rackE, ...packet.rackF];
}

// The lowest integrity a hit may leave `seg` at: the Core's emergency reset, or 60 for the last copy of
// a tool kind that is still at least that good (every other copy is below it), else 0.
function hitFloor(files: readonly Segment[], seg: Segment): number {
  if (seg.type === 'core') return CORE_RESET_INTEGRITY;
  const kind = toolKindOf(seg);
  if (kind === null) return 0;
  const othersGood = files.some((file) => file !== seg && toolKindOf(file) === kind && hasIntegrity(file)
    && file.integrity >= TRANSIT_LAST_COPY_FLOOR);
  return othersGood ? 0 : TRANSIT_LAST_COPY_FLOOR;
}

function hitRecord(seg: Segment, from: number, to: number): TransitHit {
  return { segId: seg.id, fileName: seg.name, role: seg.role ?? null, from, to };
}

// One hit's damage before floors: 15–35 points, integer.
function rollDamage(rng: Rng): number {
  return TRANSIT_HIT_MIN + Math.floor(rng() * (TRANSIT_HIT_MAX - TRANSIT_HIT_MIN + 1));
}

// Lands `count` seeded hits on the packed files, in place (step 2). A hit picks a file weighted by its
// size among those it can still hurt (above their floor), then takes 15–35 points (the Core at most
// TRANSIT_CORE_MAX_HIT), stopped at the floor. Returns the hits as applied, in order: the ECC lines are
// generated from these, so they always say what really happened. A hit with no file left to hurt is lost.
export function rollTransitHits(files: readonly Segment[], count: number, rng: Rng): TransitHit[] {
  const hits: TransitHit[] = [];
  for (let i = 0; i < count; i++) {
    const targets = files.filter((seg) => hasIntegrity(seg) && seg.integrity > hitFloor(files, seg));
    const totalBlocks = targets.reduce((sum, seg) => sum + seg.size, 0);
    // Both draws are taken every hit, so one hit's choice never shifts the next hit's numbers.
    const pick = rng() * totalBlocks;
    const damage = rollDamage(rng);
    if (totalBlocks === 0) continue;
    let acc = 0;
    const target = targets.find((seg) => (acc += seg.size) > pick) ?? targets[targets.length - 1]!;
    if (!hasIntegrity(target)) throw new Error(`rollTransitHits: ${target.name} has no integrity`);
    const from = target.integrity;
    const dealt = target.type === 'core' ? Math.min(damage, TRANSIT_CORE_MAX_HIT) : damage;
    setIntegrity(target, Math.max(hitFloor(files, target), from - dealt));
    hits.push(hitRecord(target, from, target.integrity));
  }
  return hits;
}

// An emergency transmission's toll on the Core (§6.9): a crash costs it `coreHit` points (not below
// its reset), and a Core HOLLOW ate to 0 is restored to CORE_RESET_INTEGRITY. Either way it arrives
// clean: the transmission rebuilds it from its last good state, so it never lands still being eaten
// (at 25% and 3.5 %/s it would be lost again within seconds). In place; returns the hit, if any.
export function emergencyCoreToll(files: readonly Segment[], coreHit: number, coreLost: boolean): TransitHit | null {
  const core = files.find((seg) => seg.type === 'core');
  if (!core || core.type !== 'core') throw new Error('emergencyCoreToll: the packet has no AI Core');
  delete core.infected;
  const from = core.integrity;
  if (coreLost) setIntegrity(core, CORE_RESET_INTEGRITY);
  else setIntegrity(core, from - crashCoreToll(from, coreHit));
  return from === core.integrity ? null : hitRecord(core, from, core.integrity);
}

// The points a crash's emergency transmission really takes from a Core at `from` (the TRANSMIT screen says
// this number): `coreHit`, but never below the reset. A Core already at or below its reset (a fight it
// barely won) is not pushed lower, nor raised.
export function crashCoreToll(from: number, coreHit: number): number {
  return Math.max(0, Math.min(coreHit, from - CORE_RESET_INTEGRITY));
}

// The REPAIR CHARGE the unit has on arrival (step 3): what crossed plus the star credit, never fewer
// than CHARGE_ARRIVAL_FLOOR blocks (a guarantee, §8.1: a kid who lost every star still gets a fight).
export interface ArrivalCharge {
  blocks: number;
  floorAdded: number;
}

// `cardCharge`: what the picked card brings (+12 REPAIR CHARGE; none for every other card).
export function arrivalCharge(chargeCarried: number, starCredit: number, cardCharge = 0): ArrivalCharge {
  const earned = chargeCarried + starCredit + cardCharge;
  const blocks = Math.max(CHARGE_ARRIVAL_FLOOR, earned);
  return { blocks, floorAdded: blocks - earned };
}

export interface CarriedLayout {
  racks: CarriedRacks;
  chargeBlocks: number;     // what was laid out (after any overflow)
  overflowLost: number;     // charge that did not fit memory
}

// The packed files back into memory on `ship` (step 4): 01-landing §3.16's pooled receiver. The files go as one block
// from rack E's start, rack E's list and rack F's list back to back (no gap at rack F), then REPAIR CHARGE, then the
// free rest of the receiver. The room for the unit is the receiver plus the tail: only a block longer than the receiver
// starts earlier, right-aligned to the end of memory, by at most UNIT_TAIL_BLOCKS into the last pod rack (and never into
// more of it than the ship's layout leaves free at its end), so the Core stays at rack E's start on almost every ship.
// Charge that still does not fit is lost, loudly (the caller's CHARGE OVERFLOW); files that do not fit throw (the
// PACKET screen checks the room before the beam).
export function layoutCarried(packet: Packet, chargeBlocks: number, ship: ShipDef): CarriedLayout {
  const files = [...packet.rackE, ...packet.rackF];
  const filesBlocks = files.reduce((sum, seg) => sum + seg.size, 0);
  const receiver = MEMORY_TOTAL_BLOCKS - RACK_E_START;
  const tail = Math.min(UNIT_TAIL_BLOCKS, lastPodRackTrailingFree(ship));
  const room = receiver + tail;
  if (filesBlocks > room) {
    throw new Error(`layoutCarried: ${filesBlocks} blocks of files do not fit ${ship.name}'s room (${receiver} + a tail of ${tail})`);
  }
  const charge = Math.max(0, Math.min(chargeBlocks, room - filesBlocks));
  const overflowLost = chargeBlocks - charge;
  const block = filesBlocks + charge;
  const startAddr = Math.min(RACK_E_START, MEMORY_TOTAL_BLOCKS - block);
  const segs: Segment[] = [...files];
  if (charge > 0) segs.push(chargeSegment(packet.charge, charge));
  const free = MEMORY_TOTAL_BLOCKS - (startAddr + block);
  if (free > 0) segs.push(freeSegment(free));
  return { racks: { startAddr, segs }, chargeBlocks: charge, overflowLost };
}

// REPAIR CHARGE as it arrives: `points` of charge in as many blocks (the blocks a repair had spent
// do not cross the link), a full pool again. A unit that spent its last point carried no pool file
// (actions.ts retireEmptyCharge freed its blocks), so the floor and the star credit arrive in a fresh one,
// written like a fresh unit's under an id of its own.
function chargeSegment(packed: RedundancySegment | null, points: number): RedundancySegment {
  const pool = packed ?? { ...freshChargeFile(), id: newSegId('redund') };
  return { ...pool, size: points, used: points, capacity: Math.max(pool.capacity, points) };
}

// The ship's own damage to the arriving unit (step 5, §6.9): each listed role's best copy is cut to at
// most its maxIntegrity. In place; returns what it did, for the ECC line.
// A unit that carries no file with the role is not damaged by that rule: the kid left the file behind on the
// TRANSMIT screen (Sensor Interp is one of the safe-to-drop chips, §6.9) or HOLLOW ate it, and the missing file
// is already its own loud state (capabilities: `missing`; KESTREL then flies PATH UNCERTAIN all the way).
export function arrivalDamage(segs: readonly Segment[], damage: readonly ArrivalDamage[]): TransitHit[] {
  const hits: TransitHit[] = [];
  for (const rule of damage) {
    const copies = segs.filter((seg): seg is HealthSegment => seg.role === rule.role && hasIntegrity(seg));
    const best = copies.sort((a, b) => b.integrity - a.integrity)[0];
    if (!best) continue;
    if (best.integrity <= rule.maxIntegrity) continue;
    const from = best.integrity;
    setIntegrity(best, rule.maxIntegrity);
    hits.push(hitRecord(best, from, best.integrity));
  }
  return hits;
}

// A fresh unit (ship 1's written racks E–F: SCAN, 36 REPAIR CHARGE) as it would arrive on `ship` with no
// transit hits and no stars: what the headless suites fly a later ship with on its own (tests/unit/wp1's
// AP_SHIP harness and tests/unit/wp7's pass it to createInitialState explicitly; the game itself only ever
// carries a real unit). It lives here because it is packUnit and layoutCarried run on the written racks.
// Throws for a ship nothing transmits to.
export function freshUnitRacks(ship: ShipDef): CarriedRacks {
  if (!ship.arrival) throw new Error(`freshUnitRacks: ${ship.name} meets a fresh unit by itself (no link)`);
  const files = [...FRESH_UNIT_RACK_E, ...FRESH_UNIT_RACK_F]
    .filter((item): item is Exclude<typeof item, { free: number }> => !('free' in item))
    .map((item) => structuredClone(item) as Segment);
  const packet = packUnit(files, ship.arrival.linkBlocks, []);
  return layoutCarried(packet, packet.chargeCarried, ship).racks;
}
