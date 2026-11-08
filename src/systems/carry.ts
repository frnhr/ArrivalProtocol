// Slice 4c–4e: Track SENTRY owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2): the disguise through
// layoutCarried. Others ask by message.
import type { Segment, RedundancySegment, SegmentRole } from '@/types/segment';
import type { TransitHit, ArrivalSeed } from '@state/schema';
import type { ShipDef, ArrivalDamage } from '@data/ships';
import type { ShipThreat, BeamSeedPlan } from '@/types/threat';
import type { Rng } from '@systems/rng';
import { freeSegment, newSegId } from '@systems/memory-ops';
import { beamSeedSegment } from '@systems/beam-seeds';
import { hasIntegrity, isSkillFile, type HealthSegment } from '@state/selectors';
import { SKILL_IDS } from '@data/skills';
import type { SkillId } from '@/types/skill';
import { setIntegrity } from '@state/actions';
import { FS_TOOL_KINDS } from '@data/fs-tools';
import { CLASSIC_FIVE, CLASSIC_HOPS } from '@data/classic-five';
import { nominalShipThreat } from '@systems/threat-plan';
import {
  FRESH_UNIT_RACK_E, FRESH_UNIT_RACK_F, isUnitFileType, freshChargeFile, layoutFor, fillRoom, roomForUnitOn,
  BEAM_SEED_LAYOUT_BLOCKS, type CarriedRacks,
} from '@data/memory';
import {
  TRANSIT_HIT_MIN, TRANSIT_HIT_MAX, TRANSIT_LAST_COPY_FLOOR, TRANSIT_CORE_MAX_HIT, CORE_RESET_INTEGRITY,
  CHARGE_ARRIVAL_FLOOR, SEED_BLOCKS, SEED_TOOL_GAP_BLOCKS, WALL_MIN_BLOCKS, SEED_GAP_TO_TARGET_BLOCKS,
} from '@data/tuning';

export { BEAM_SEED_LAYOUT_BLOCKS };

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
// 3. arrivalCharge: +6 per ★ of the last ship, +12 for the charge card, and never fewer than the destination's floor
//    (§6.5's 12 blocks on FULL and COMPACT ships; none on a TIGHT one, 01 §3.16).
// 4. layoutCarried: the files back into memory, 01-landing §3.16's pooled receiver: rack E's list and rack F's
//    list as one block from rack E's start (with a hunting ground between them on a ship whose seeds hunt tools), then
//    the charge; a block longer than the receiver spills backward
//    into the last pod rack's tail (at most UNIT_TAIL_BLOCKS), and REPAIR CHARGE that still does not fit is lost,
//    loudly (any other overflow throws). A unit that spent its last point of charge before TRANSMIT has no pool
//    file left: its arrival charge is written into a fresh one (the floor is a guarantee). The beam seeds (phase 3
//    slice 2, 04 §3.4) go right behind their targets, each as GAP, seed, WALL.
// 5. arrivalDamage: the ship's own scripted damage (KESTREL, VESPER), named like a hit.

// The order rack E is packed in (§6.9): the Core, then the AI tools by their job.
const RACK_E_ROLE_ORDER: readonly SegmentRole[] = ['core', 'engine-io', 'autopilot', 'sensor', 'navplot', 'telemetry', 'comms'];

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
// 046.log is locked too (05 §3.2: `LOCKED · 046 ASKED YOU TO CARRY IT`).
// Slice 4: a skill file trained at this desk ('trained': `TRAINED HERE · ◀ CHART TO UNDO`, plan §2.3, §7 R8): leaving behind
// what was just paid for is UNDO's job. Its fresh file is not in memory (the packet's skill plan adds it), so the PACKET
// marks its chip; dropLock never sees it.
export type DropLock = 'core' | 'engine' | 'navplot' | 'last-copy' | 'charge' | 'log' | 'trained';

export function dropLock(files: readonly Segment[], seg: Segment): DropLock | null {
  if (seg.type === 'core') return 'core';
  if (seg.type === 'log') return 'log';
  if (seg.type === 'redundancy') return 'charge';
  if (seg.role === 'engine-io') return 'engine';
  if (seg.role === 'navplot') return 'navplot';
  if (seg.type !== 'fs-tool') return null;
  const kind = toolKindOf(seg);
  return files.filter((file) => toolKindOf(file) === kind).length === 1 ? 'last-copy' : null;
}

function rackESortKey(seg: Segment): number {
  const roleIndex = seg.role ? RACK_E_ROLE_ORDER.indexOf(seg.role) : -1;
  if (roleIndex >= 0) return roleIndex;
  // Skills go last, after the AI tools and the card files, in SKILL_IDS order (slice 4, 03 §3.4): a fresh file that replaces
  // a skill's old one (an upgrade, a RESTORE) or a packed-lower copy keeps the place the old one had.
  if (isSkillFile(seg)) return RACK_E_ROLE_ORDER.length + 1 + SKILL_IDS.indexOf(seg.upgrade);
  // The other files with no listed role (the card files) go after every AI tool.
  return RACK_E_ROLE_ORDER.length;
}

// Rack F: the fs-tools by kind, then FIREWALLs (§6.9), then 046.log (as the fresh unit's rack F has it, before REPAIR
// CHARGE).
function rackFSortKey(seg: Segment): number {
  if (seg.type === 'fs-tool') return FS_TOOL_KINDS.indexOf(seg.fsTool);
  return seg.type === 'log' ? FS_TOOL_KINDS.length + 1 : FS_TOOL_KINDS.length;
}

function packsInRackF(seg: Segment): boolean {
  return seg.type === 'fs-tool' || seg.type === 'firewall' || seg.type === 'log';
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
  // Blocks of files over the link (files − link, when positive; the slice-3a review's B1): such a packet can't cross
  // until files are left behind (the PACKET says `n TOO MANY FOR THE LINK` and TRANSMIT ▸ waits; transmitNext throws).
  overLink: number;
  chargeHeld: number;       // the charge the unit had at TRANSMIT
  chargeCarried: number;    // what crosses: min(charge, link − files), none while the files are over the link
  // The beam seeds riding along (phase 3 slice 2, 04 §3.4; systems/beam-seeds.ts rollBeamSeeds, at the beam): hitchhikers
  // ride free, so they are in neither filesBlocks nor the link; they take room only at the boot (layoutCarried).
  seeds: BeamSeedPlan[];
  // Phase 3 slice 3b: the delivery chips' files as packed (systems/draft.ts planPacket, the one adder, fills it; packUnit
  // knows no chips): each chip not sent on and the ids of the files it laid out, in chip order. The send reads it for
  // the delivery seeds (behind their own file), the beam seeds' exclusion and ArrivalReport.deliveries.
  deliveries: PacketDelivery[];
  // Slice 4: the skill files the packet's skill plan changed (systems/draft.ts planPacket fills it; packUnit knows no plan):
  // each fresh one (trained, upgraded or restored at this desk) and each packed lower (PACK AS), by id. A skill file not
  // listed crosses as it was. The PACKET's chips and ArrivalReport.skills read it.
  skills: PacketSkill[];
}

export interface PacketSkill {
  segId: string;
  skill: SkillId;
  how: 'fresh' | 'packed';
}

export interface PacketDelivery {
  key: string;
  segIds: string[];
}

// Packs the unit for a link of `linkBlocks` (step 1 of the header). Copies only: memory is not touched.
// `added` is the picked card's new file (systems/draft.ts cardFiles), packed with the rest; none when the
// card brings no file. Throws on a drop that is locked and on an unknown id. Files over the link are reported (overLink),
// not thrown on: a unit grown past a short arm hop's link (82 at 58 LY) must still reach its PACKET, which asks for files
// to be left behind (the slice-3a review's B1: SET COURSE threw there).
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
  const overLink = Math.max(0, filesBlocks - linkBlocks);
  const held = charges[0] ?? null;
  const chargeHeld = held ? held.used : 0;
  const chargeCarried = Math.max(0, Math.min(chargeHeld, linkBlocks - filesBlocks));
  const charge = held ? packedCopy(held) as RedundancySegment : null;
  return { linkBlocks, rackE, rackF, charge, filesBlocks, overLink, chargeHeld, chargeCarried, seeds: [], deliveries: [], skills: [] };
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

// `cardCharge`: what the picked card brings (+12 REPAIR CHARGE; none for every other card). `floor` is the destination's
// (its memory layout's chargeFloor, slice 3a step 2: 12 on FULL and COMPACT ships, none on a TIGHT one, 01 §3.16 round 2
// Q8: there the charge may arrive at 0); left out, the 12 every classic ship has.
// Slice 7c (R32): `giftCharge`, a trace's gift on arrival (systems/trace-gifts.ts traceGiftCharge: TRACE_GIFT_CHARGE at a gift
// ship, REASSIGNMENT's allowance at the final ship; 0 until Track TRACE builds it), laid out with the rest, so a squeezed
// receiver loses it as loudly as any charge.
export function arrivalCharge(
  chargeCarried: number, starCredit: number, cardCharge = 0, floor: number = CHARGE_ARRIVAL_FLOOR, giftCharge = 0,
): ArrivalCharge {
  if (!(Number.isInteger(floor) && floor >= 0)) throw new Error(`arrivalCharge: floor ${floor}`);
  if (!(Number.isInteger(giftCharge) && giftCharge >= 0)) throw new Error(`arrivalCharge: gift ${giftCharge}`);
  const earned = chargeCarried + starCredit + cardCharge + giftCharge;
  const blocks = Math.max(floor, earned);
  return { blocks, floorAdded: blocks - earned };
}

export interface CarriedLayout {
  racks: CarriedRacks;
  chargeBlocks: number;     // what was laid out (after any overflow)
  overflowLost: number;     // charge that did not fit memory
  // The beam seeds as laid out, in the packet's order (ArrivalReport.seeds: the boot's ECC seeds line names each target,
  // and reports a stray as loose, not next to the file it was rolled for).
  seeds: ArrivalSeed[];
}

// The hunting ground (review issue 5): on a ship whose seeds hunt your tools ('near-tools': the HUNT stage, phase 2's
// VESPER, §6.6; keyed by the ladder's verdict for the ship since slice 2), rack E's list
// and rack F's list are laid out with a free run between them: a WALL off your AI files, then room for a seed
// SEED_TOOL_GAP_BLOCKS from the first filesystem tool (hollow.ts nearToolsSeedSpot lands it there). That is phase 2's
// geometry (rack E's free tail, then the tools from rack F's start), which the pooled receiver had packed away: every tool
// sat back to back between the AI files and REPAIR CHARGE, no free gap bordered one until a licence was written on the
// ship (and that tool is untried, so spared), and the seed fell back to the middle of rack D. The WALL keeps a chain
// that eats the tools away from the AI files and the Core. Only when the receiver has the room: it never costs charge,
// and never spills the block into the tail.
function huntingGapBlocks(threat: Readonly<ShipThreat>, packet: Packet, filesBlocks: number, chargeBlocks: number, receiver: number): number {
  const hunts = threat.hollow.seed?.target === 'near-tools';
  if (!hunts || packet.rackE.length === 0 || !packet.rackF.some((seg) => seg.type === 'fs-tool')) return 0;
  const gap = WALL_MIN_BLOCKS + SEED_BLOCKS + SEED_TOOL_GAP_BLOCKS;
  return filesBlocks + gap + chargeBlocks <= receiver ? gap : 0;
}

// The packed files back into memory on `ship` (step 4): 01-landing §3.16's pooled receiver. The files go as one block
// from rack E's start, rack E's list and rack F's list back to back (no gap at rack F, but the hunting ground above on
// VESPER), then REPAIR CHARGE, then the free rest of the receiver. The room for the unit is the receiver plus the tail:
// only a block longer than the receiver starts earlier, right-aligned to the end of memory, by at most UNIT_TAIL_BLOCKS
// into the last pod rack (and never into more of it than the ship's layout leaves free at its end), so the Core stays at
// rack E's start on almost every ship. Charge that still does not fit is lost, loudly (the caller's CHARGE OVERFLOW);
// files that do not fit throw (the PACKET screen checks the room before the beam). `threat` is the ladder's verdict for
// `ship` (TransitPlan.threat): it says whether HOLLOW's seeds hunt tools there.
// The beam seeds (04 §3.4; packet.seeds, named `owner`: what the kid calls HOLLOW now, say.ts hollowLabel) each go right
// behind their target: the file, a GAP of SEED_GAP_TO_TARGET_BLOCKS, the seed, a WALL of WALL_MIN_BLOCKS, then the next
// file, so a seed bites only the file the ECC line names. 01's unpack order is files, the seeds, then the charge, but on
// a FULL ship CHARGE_ARRIVAL_FLOOR comes before the seeds and holds (04 §3.4): a seed takes its BEAM_SEED_LAYOUT_BLOCKS
// from the room the files and that floor leave, and the charge above the floor gets what the seeds leave. The no-room
// rule: in the pooled receiver every target has the same room (the block only grows), so re-picking a target never finds
// more; a seed with no room is a stray (CarriedRacks.strays), which buildShipMemory lands in the centre of the largest free
// region of the whole memory (on a full receiver that is in the pod racks: 04 §3.4, round-2 decision 9).
export function layoutCarried(
  packet: Packet, chargeBlocks: number, ship: ShipDef, threat: Readonly<ShipThreat>, owner?: string,
): CarriedLayout {
  const files = [...packet.rackE, ...packet.rackF];
  const filesBlocks = files.reduce((sum, seg) => sum + seg.size, 0);
  const layout = layoutFor(ship.memoryClass);
  const receiver = layout.receiverBlocks;
  const room = roomForUnitOn(ship);
  if (packet.overLink > 0) throw new Error(`layoutCarried: ${packet.overLink} blocks of files over the link were sent`);
  if (filesBlocks > room) {
    throw new Error(`layoutCarried: ${filesBlocks} blocks of files do not fit ${ship.name}'s room (${room})`);
  }
  if (packet.seeds.length > 0 && owner === undefined) throw new Error('layoutCarried: beam seeds need an owner name (say.ts hollowLabel)');
  for (const plan of packet.seeds) {
    if (!files.some((seg) => seg.id === plan.targetId)) throw new Error(`layoutCarried: beam seed target ${plan.targetId} is not in the packet`);
  }
  if (new Set(packet.seeds.map((plan) => plan.targetId)).size !== packet.seeds.length) throw new Error('layoutCarried: two beam seeds behind one file');
  // 01 §3.16's fill order: files, the floor (none on a TIGHT ship), the seeds, the rest of the charge (data/memory.ts
  // fillRoom, the rule the card and the PACKET preview).
  const fill = fillRoom(room, filesBlocks, layout.chargeFloor, chargeBlocks, packet.seeds.length);
  const placed = fill.seedsPlaced;
  const seedsBlocks = placed * BEAM_SEED_LAYOUT_BLOCKS;
  const charge = fill.charge;
  const overflowLost = fill.lost;
  const hunting = huntingGapBlocks(threat, packet, filesBlocks + seedsBlocks, charge, receiver);
  const block = filesBlocks + seedsBlocks + hunting + charge;
  const startAddr = Math.min(layout.unitStart, layout.totalBlocks - block);
  const seedSegs = packet.seeds.map((plan) => beamSeedSegment(plan, owner!));
  const segs: Segment[] = [];
  files.forEach((seg, index) => {
    if (hunting > 0 && index === packet.rackE.length) segs.push(freeSegment(hunting));
    segs.push(seg);
    const seedIndex = packet.seeds.findIndex((plan) => plan.targetId === seg.id);
    if (seedIndex < 0 || seedIndex >= placed) return;
    segs.push(freeSegment(SEED_GAP_TO_TARGET_BLOCKS), seedSegs[seedIndex]!, freeSegment(WALL_MIN_BLOCKS));
  });
  if (charge > 0) segs.push(chargeSegment(packet.charge, charge));
  const free = layout.totalBlocks - (startAddr + block);
  if (free > 0) segs.push(freeSegment(free));
  const strays = seedSegs.slice(placed);
  const seeds = packet.seeds.map((plan, index): ArrivalSeed => ({
    segId: seedSegs[index]!.id, targetName: plan.targetName, disguise: plan.disguise?.name ?? null, ...(index >= placed ? { loose: true as const } : {}),
  }));
  return { racks: { startAddr, segs, ...(strays.length > 0 ? { strays } : {}) }, chargeBlocks: charge, overflowLost, seeds };
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
// carries a real unit). It lives here because it is packUnit and layoutCarried run on the written racks. Packed for
// `linkBlocks` and laid out for `threat`: left out, a classic ship's (data/classic-five.ts: its link, and the nominal
// run's verdict on it, systems/threat-plan.ts nominalShipThreat), with no beam seeds (risk 14: the flight sims stay
// seed-free). Throws for a first ship (nothing transmits to it) and, without both, for a ship that is not classic.
export function freshUnitRacks(ship: ShipDef, linkBlocks?: number, threat?: Readonly<ShipThreat>): CarriedRacks {
  if (ship.kind === 'first') throw new Error(`freshUnitRacks: ${ship.name} meets a fresh unit by itself (no link)`);
  // By id and world (an arm ship may share an id, the arm's KESTREL is 'kestrel' too, but never a classic slot's world).
  const twin = CLASSIC_FIVE[ship.slot];
  const classic = twin?.id === ship.id && twin.world === ship.world;
  if (!classic && (linkBlocks === undefined || threat === undefined)) {
    throw new Error(`freshUnitRacks: ${ship.name} is not a classic ship: pass its link and verdict`);
  }
  const files = [...FRESH_UNIT_RACK_E, ...FRESH_UNIT_RACK_F]
    .filter((item): item is Exclude<typeof item, { free: number }> => !('free' in item))
    .map((item) => structuredClone(item) as Segment);
  const packet = packUnit(files, linkBlocks ?? CLASSIC_HOPS[ship.slot]!.linkBlocks, []);
  return layoutCarried(packet, packet.chargeCarried, ship, threat ?? nominalShipThreat(ship.slot)).racks;
}
