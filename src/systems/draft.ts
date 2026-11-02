import type { Store } from '@state/store';
import type { GameState, TransitPlan } from '@state/schema';
import type { Segment, FirewallSegment, UpgradeSegment } from '@/types/segment';
import type { Hop } from '@/types/map';
import type { DeliveryChip } from '@/types/repo';
import { packUnit, type Packet } from '@systems/carry';
import { chargeLeft, upgradeFiles, isFirewall } from '@state/selectors';
import { hollowLabel } from '@systems/say';
import { draftCards, UPGRADE_FILE_TEXT, type UpgradeId, type DraftContext, type DraftCard } from '@data/upgrades';
import {
  REPAIR_V2_VERSION, THREAD_PLUS_THREADS, CHARGE_CARD_BLOCKS, FIREWALL_BLOCKS, FUEL_TRIM_BLOCKS, INTEGRITY_MAX,
} from '@data/tuning';
import { visitRng } from '@systems/map-streams';
import { deliveryFiles } from '@systems/repository';

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
  };
}

// What the draft reads at this TRANSMIT: the run's stats, the charge held, the ship just left, what the unit
// owns, whether it has a Repair, the room its files leave (`linkRoom`: the next ship's link, and on a hop with a room
// that room less the floor, whichever is less, never below 0), and what the strip calls HOLLOW (the reasons name it the
// way the kid saw it). A unit whose files are over the link is dealt no file card (the review's B1: a FIREWALL picked
// there would only add to what must be left behind); on the classic world the link always binds first, so its deals
// are phase 2's.
export function draftContext(
  state: Readonly<GameState>, linkBlocks: number, room?: Readonly<Pick<Hop, 'room' | 'chargeFloor'>>,
): DraftContext {
  const last = state.run.ships[state.run.ships.length - 1] ?? null;
  const files = packUnit(state.memory, linkBlocks, []).filesBlocks;
  const roomLeft = room === undefined ? Infinity : room.room - room.chargeFloor - files;
  return {
    stats: state.run.stats,
    chargeHeld: chargeLeft(state),
    lastShip: last === null ? null : { name: last.shipName, fuelLeftPct: last.fuelLeftPct },
    owned: ownedUpgrades(state),
    hasRepair: state.memory.some((seg) => seg.type === 'fs-tool' && seg.fsTool === 'repair'),
    linkRoom: Math.max(0, Math.min(linkBlocks - files, roomLeft)),
    hollowLabel: hollowLabel(state.run),
  };
}

// The cards for the TRANSMIT now being prepared (goTransmit), seeded by the ship being left: a hop (its link and room),
// or a bare link (the classic suites).
export function dealDraft(state: Readonly<GameState>, hop: number | Readonly<Pick<Hop, 'linkBlocks' | 'room' | 'chargeFloor'>>): DraftCard[] {
  const context = typeof hop === 'number' ? draftContext(state, hop) : draftContext(state, hop.linkBlocks, hop);
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
export interface PacketPlan {
  linkBlocks: number;
  dropped: readonly string[];
  pick: TransitPlan['pick'];
  deliveries: readonly DeliveryChip[];
}

export function planPacket(
  memory: readonly Segment[], plan: Readonly<PacketPlan>,
  makeId: (prefix: string) => string = PREVIEW_ID,
): Packet {
  return packUnit(memory, plan.linkBlocks, plan.dropped, [...cardFiles(plan.pick, makeId), ...deliveryFiles(plan.deliveries, memory, makeId)]);
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
  const packet = planPacket(state.memory, { ...plan, pick: id });
  store.update((draft) => {
    if (!draft.run.transit) throw new Error('pickCard: the transit plan vanished');
    draft.run.transit.pick = id;
    draft.run.transit.filesBlocks = packet.filesBlocks;
    draft.run.transit.chargeCarried = packet.chargeCarried;
  });
  return null;
}
