// Slice 4c–4e: Track SENTRY owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2): DraftContext.firewallCompiler.
// Others ask by message.
import type { Store } from '@state/store';
import type { GameState, TransitPlan } from '@state/schema';
import type { Segment, FirewallSegment, UpgradeSegment } from '@/types/segment';
import type { Hop } from '@/types/map';
import type { DeliveryChip } from '@/types/repo';
import { packUnit, type Packet, type PacketSkill } from '@systems/carry';
import { skillPacketPlan, applySkillPlan, type SkillPacketPlan } from '@systems/skill-files';
import { shipSummaryAt } from '@systems/map-run';
import { chargeLeft, upgradeFiles, isFirewall } from '@state/selectors';
import { skillLive } from '@systems/capabilities';
import { hollowLabel } from '@systems/say';
import { draftCards, UPGRADE_FILE_TEXT, type UpgradeId, type DraftContext, type DraftCard } from '@data/upgrades';
import {
  REPAIR_V2_VERSION, THREAD_PLUS_THREADS, CHARGE_CARD_BLOCKS, FIREWALL_BLOCKS, FUEL_TRIM_BLOCKS, INTEGRITY_MAX, SENTRY_FIREWALL_VERSION,
} from '@data/tuning';
import { visitRng } from '@systems/map-streams';
import { deliveryFileGroups } from '@systems/repository';

// PICK ONE TO CARRY (§6.9, §9 WP8 items 1–2), the systems half: the draft dealt at TRANSMIT from the run's
// seed and stats, the pick, and what the picked card does to the packet. DOM-free; the TRANSMIT screen shows
// the cards (WP8 part 2) and systems/run.ts sends the packet with the pick applied.
// • The deal: visitRng(run, 'draft'): the run seed and the slot of the ship being left, so the same run deals the same cards
//   at the same TRANSMIT whatever was clicked on the screen; dealt once (goTransmit) and kept in the plan.
// • Owned is what the unit really carries: FIREWALLs and FUEL TRIMs by their files in memory (one deleted or
//   eaten can be drafted again), REPAIR v2 by a Repair copy at v2, THREAD+ by the cards picked this run (it
//   is the Core's own capacity, and the Core is never lost). The charge card stacks without limit.
// • The pick changes the packet before it crosses: a file card's new file packs with the unit's own (it
//   takes link room, and transit hits can land on it); REPAIR v2 bumps every Repair copy; THREAD+ the Core's
//   capacity; +12 REPAIR CHARGE arrives with the star credit (systems/carry.ts arrivalCharge).

// How many of each card the unit owns now (see the header).
export function ownedUpgrades(state: Readonly<GameState>): Record<UpgradeId, number> {
  return {
    firewall: state.memory.filter(isFirewall).length,
    'repair-v2': state.memory.some((seg) => seg.type === 'fs-tool' && seg.fsTool === 'repair' && seg.version >= REPAIR_V2_VERSION) ? 1 : 0,
    'thread-plus': state.run.upgrades.filter((id) => id === 'thread-plus').length,
    charge: 0,
    'fuel-trim': upgradeFiles(state.memory, 'fuel-trim').length,
    cycles: 0,
  };
}

// What the draft reads at this TRANSMIT: the run's stats, the charge held, the ship just left, what the unit
// owns, whether it has a Repair, the room its files leave (`linkRoom`: the next ship's link, and on a hop with a room
// that room less the floor, whichever is less, never below 0), and what the strip calls HOLLOW (the reasons name it the
// way the kid saw it). A unit whose files are over the link is dealt no file card (the review's B1: a FIREWALL picked
// there would only add to what must be left behind); on the classic world the link always binds first, so its deals
// are phase 2's.
// Phase 3 slice 3b: the files count the hop's deliveries as first packed (`deliveries`: the plan's chips, none sent on yet;
// slice-3b-plan risk 17's reading: the deal stays keyed by the slot left, and a SEND ON later does not re-deal), and the arm
// deals salvage only (UpgradeDef.salvage: REPAIR v2 moved to the repository, 02 §3.10).
// Slice 4: the files count this desk's training (the pending purchases' files: skill-files.ts skillPacketPlan, nothing packed
// lower yet), and the context says whether the unit has a tree (the arm) and whether the hop goes into a final ship
// (`room.to`: the +2 CYCLES card is never dealt there, plan §7 R12; a bare link, the classic suites', goes nowhere final).
export function draftContext(
  state: Readonly<GameState>, linkBlocks: number, room?: Readonly<Pick<Hop, 'room' | 'chargeFloor'> & Partial<Pick<Hop, 'to'>>>,
  deliveries: readonly DeliveryChip[] = [],
): DraftContext {
  const last = state.run.ships[state.run.ships.length - 1] ?? null;
  const files = planPacket(state.memory, { linkBlocks, dropped: [], pick: null, deliveries, skills: skillPacketPlan(state, {}) }).filesBlocks;
  const tree = state.run.map.world === 'arm';
  const roomLeft = room === undefined ? Infinity : room.room - room.chargeFloor - files;
  return {
    stats: state.run.stats,
    chargeHeld: chargeLeft(state),
    lastShip: last === null ? null : { name: last.shipName, fuelLeftPct: last.fuelLeftPct },
    owned: ownedUpgrades(state),
    hasRepair: state.memory.some((seg) => seg.type === 'fs-tool' && seg.fsTool === 'repair'),
    linkRoom: Math.max(0, Math.min(linkBlocks - files, roomLeft)),
    hollowLabel: hollowLabel(state.run),
    salvageOnly: state.run.map.world === 'arm',
    tree,
    toFinal: room?.to !== undefined && shipSummaryAt(state.run.map, room.to).final,
    // Slice 4d: SENTRY v3 working as the PACKET opens takes the FIREWALL card out of the deal (it compiles its own).
    ...(skillLive(state.memory, 'sentry').version >= SENTRY_FIREWALL_VERSION ? { firewallCompiler: true } : {}),
  };
}

// The cards for the TRANSMIT now being prepared (goTransmit), seeded by the ship being left: a hop (its link and room),
// or a bare link (the classic suites), with the hop's delivery chips as first packed.
export function dealDraft(
  state: Readonly<GameState>, hop: number | Readonly<Pick<Hop, 'linkBlocks' | 'room' | 'chargeFloor'> & Partial<Pick<Hop, 'to'>>>,
  deliveries: readonly DeliveryChip[] = [],
): DraftCard[] {
  const context = typeof hop === 'number' ? draftContext(state, hop, undefined, deliveries) : draftContext(state, hop.linkBlocks, hop, deliveries);
  return draftCards(context, visitRng(state.run, 'draft'));
}

// The new file a file card adds to the packet, with an id from `makeId` (the real send mints one; the
// screen's numbers only need its size). Not a file card: none.
export function cardFiles(id: UpgradeId | null, makeId: (prefix: string) => string): Segment[] {
  if (id === null) return [];
  switch (id) {
    case 'firewall': {
      const firewall: FirewallSegment = {
        id: makeId('firewall'), name: UPGRADE_FILE_TEXT.firewall.name, type: 'firewall', size: FIREWALL_BLOCKS,
        desc: UPGRADE_FILE_TEXT.firewall.desc,
      };
      return [firewall];
    }
    case 'fuel-trim': {
      const trim: UpgradeSegment = {
        id: makeId('trim'), name: UPGRADE_FILE_TEXT.fuelTrim.name, type: 'upgrade', upgrade: 'fuel-trim', size: FUEL_TRIM_BLOCKS,
        integrity: INTEGRITY_MAX, state: 'intact', scanned: true, desc: UPGRADE_FILE_TEXT.fuelTrim.desc,
      };
      return [trim];
    }
    case 'repair-v2':
    case 'thread-plus':
    case 'charge':
    case 'cycles':
      return [];
  }
}

// The id the screen's previews give a card's file: it never reaches memory.
export const PREVIEW_ID = (prefix: string): string => `${prefix}~preview`;

// The packet a plan sends: the unit's files less the dropped ones, plus the picked card's file and the deliveries riding
// this hop (phase 3 slice 3b: every chip not sent on, systems/repository.ts deliveryFiles). planPacket is the ONE place
// files are added to a packet (slice-3b-plan §2.7 item 2): the PACKET's numbers, the preview, the draft's room and the send
// all go through it, so no number counts a delivery twice or forgets it. The screen's numbers use preview ids; the send
// passes newSegId (`makeId`), so the files that land have real ids.
// Slice 4 (plan §2.6): the skill plan too (skill-files.ts skillPacketPlan: this desk's purchases and the PACKET's PACK AS).
// Its replaced files and the originals packed lower leave the packet with the drops (never shown as drops), and the fresh
// and lowered files join it beside the card's; packet.skills names them.
export interface PacketPlan {
  linkBlocks: number;
  dropped: readonly string[];
  pick: TransitPlan['pick'];
  deliveries: readonly DeliveryChip[];
  skills: Readonly<SkillPacketPlan>;
}

export function planPacket(
  memory: readonly Segment[], plan: Readonly<PacketPlan>,
  makeId: (prefix: string) => string = PREVIEW_ID,
): Packet {
  const groups = deliveryFileGroups(plan.deliveries, memory, makeId);
  const skills = applySkillPlan(memory, plan.skills, makeId);
  // A file is left behind, replaced or packed lower, never two of these (setPackAs takes a dropped file back first).
  const both = plan.dropped.find((id) => skills.removed.includes(id));
  if (both !== undefined) throw new Error(`planPacket: ${both} is both left behind and replaced or packed lower`);
  const packet = packUnit(memory, plan.linkBlocks, [...plan.dropped, ...skills.removed], [
    ...cardFiles(plan.pick, makeId), ...groups.flatMap((group) => group.segs), ...skills.added,
  ]);
  packet.deliveries = groups.map((group) => ({ key: group.key, segIds: group.segs.map((seg) => seg.id) }));
  packet.skills = [
    ...skills.fresh.map((entry): PacketSkill => ({ segId: entry.segId, skill: entry.skill, how: 'fresh' })),
    ...Object.keys(plan.skills.packAs).map((segId): PacketSkill => {
      const seg = skills.added.find((file) => file.id === segId);
      if (seg === undefined) throw new Error(`planPacket: the packed-lower copy of ${segId} is missing`);
      return { segId, skill: seg.upgrade, how: 'packed' };
    }),
  ];
  return packet;
}

// The packet for a transit plan as it stands (its drops, pick, deliveries and PACK AS) on the run's training: what the
// PACKET's model, its toggles and the send read.
export function transitPacket(
  state: Readonly<GameState>, plan: Readonly<Pick<TransitPlan, 'linkBlocks' | 'dropped' | 'pick' | 'deliveries' | 'packAs'>>,
  makeId: (prefix: string) => string = PREVIEW_ID,
): Packet {
  return planPacket(state.memory, {
    linkBlocks: plan.linkBlocks, dropped: plan.dropped, pick: plan.pick, deliveries: plan.deliveries, skills: skillPacketPlan(state, plan.packAs),
  }, makeId);
}

// The REPAIR CHARGE the pick brings on arrival.
export function pickCharge(id: UpgradeId | null): number {
  return id === 'charge' ? CHARGE_CARD_BLOCKS : 0;
}

// What the pick does to the files already packed (the send, after packUnit): REPAIR v2 on every Repair copy
// (heal ×2, and COMPACT on REPAIR CHARGE is kept: it is v2's own), THREAD+ on the Core. In place.
export function applyPickToPacket(packet: Packet, id: UpgradeId | null): void {
  if (id === 'repair-v2') {
    const repairs = packet.rackF.filter((seg) => seg.type === 'fs-tool' && seg.fsTool === 'repair');
    if (repairs.length === 0) throw new Error('applyPickToPacket: REPAIR v2 with no Repair in the packet');
    for (const seg of repairs) if (seg.type === 'fs-tool') seg.version = Math.max(seg.version, REPAIR_V2_VERSION);
  } else if (id === 'thread-plus') {
    const core = packet.rackE.find((seg) => seg.type === 'core');
    if (!core || core.type !== 'core') throw new Error('applyPickToPacket: THREAD+ with no AI Core in the packet');
    core.capacity += THREAD_PLUS_THREADS;
  }
}

// Why a pick was refused.
export type PickRefusal = 'not-offered' | 'no-transmit';

// The kid picks a card on the TRANSMIT screen (a click, or [1]–[3]); the send waits for one. One update: the
// pick, and the packet's numbers worked out again with the card's file in it.
export function pickCard(store: Store<GameState>, id: UpgradeId): PickRefusal | null {
  const state = store.getState();
  const plan = state.run.transit;
  if (state.run.phase !== 'transmit' || plan === null) return 'no-transmit';
  if (!plan.offer.some((card) => card.id === id)) return 'not-offered';
  const packet = transitPacket(state, { ...plan, pick: id });
  store.update((draft) => {
    if (!draft.run.transit) throw new Error('pickCard: the transit plan vanished');
    draft.run.transit.pick = id;
    draft.run.transit.filesBlocks = packet.filesBlocks;
    draft.run.transit.chargeCarried = packet.chargeCarried;
  });
  return null;
}
