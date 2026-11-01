import type { Store } from '@state/store';
import type { GameState, ShipOutcome, TransitPlan } from '@state/schema';
import type { Segment } from '@/types/segment';
import { unitFilesIn, dropLock, toolKindOf, arrivalCharge, crashCoreToll, type DropLock } from '@systems/carry';
import { planPacket, pickCharge, cardFiles, PREVIEW_ID } from '@systems/draft';
import { getUpgrade, type DraftCard, type UpgradeId } from '@data/upgrades';
import { hasIntegrity, isInfected, getAiCore } from '@state/selectors';
import { getShip } from '@data/ships';
import { shipColonists } from '@data/memory';
import { TOOL_WORD } from '@data/fs-tools';
import { TRANSMIT_TEXT, DRAFT_TEXT } from '@data/script';

// The TRANSMIT screen's model (§4.1 step 5, §6.9, §9 WP7 item 4), pure and DOM-free. Mostly information:
// where the unit goes next (`NEXT: HALCYON · 2,000 SOULS · 22 LY`), how the packet fits the link
// (`LINK 120 · FILES 63 · CHARGE 14 → FITS`), what the crossing will cost (the transit hits, an emergency's
// toll) and the REPAIR CHARGE waiting on arrival. Every packed file is a chip, safest to leave behind
// first (§6.9: copies and .bak files, Telemetry, Autopilot, Sensor Interp, AI Comms, upgrades), each with
// what leaving it behind does; the Core, Engine I/O, Nav Plotter and the last copy of a filesystem tool
// are locked, and say why. Leaving a file behind frees its blocks for charge, so it is offered only while
// charge is left behind: when everything fits, a dropped file would buy nothing.
// toggleDrop is the one write: run.transit.dropped, with the packet's numbers worked out again. The cards dealt
// for the crossing (WP8, PICK ONE TO CARRY) are listed with the pick; the picked card's file is in the packet's
// numbers (systems/draft.ts planPacket), and its charge in the arrival line.

export interface PacketChip {
  segId: string;
  name: string;
  blocks: number;
  integrity: number | null;  // null for a file without health (a FIREWALL)
  infected: boolean;
  dropped: boolean;
  lock: DropLock | null;
  // Can be clicked now: to leave it behind (it is not locked, and doing so carries more charge), or to
  // take a left-behind file back.
  toggleable: boolean;
  // The chip's line: why it is locked, or what leaving it behind does.
  note: string;
  // REPAIR CHARGE leaving it behind carries (kept: would carry; dropped: carries now).
  chargeGain: number;
}

// A card dealt for this crossing, as the screen shows it (WP8 part 2): what it is, what it does, why it was
// offered, the key that picks it, and whether it is the one picked.
export interface DraftCardView extends DraftCard {
  tag: string;        // FILE · 2 BLOCKS / UPGRADE / AI CORE / ON ARRIVAL
  key: string;        // '1', '2', '3'
  picked: boolean;
}

// The picked card's new file, riding in the packet (a file card only): a chip of its own beside the unit's.
export interface CardFileChip {
  name: string;
  blocks: number;
}

export interface TransmitModel {
  toShipIndex: number;
  shipName: string;
  distanceLy: number;
  headline: string;            // NEXT: HALCYON · 2,000 SOULS · 22 LY
  why: string | null;          // how the last ship was left (an emergency, BEAM OUT, a lost ship)
  emergency: boolean;          // the why line is a warning (a crash, the Core eaten)
  link: number;
  files: number;               // blocks of the files that go
  chargeHeld: number;
  chargeCarried: number;
  packetLine: string;
  hitsLine: string;
  arrivalLine: string;
  arrivalCharge: number;
  infectedLine: string | null;
  dropLine: string;            // everything fits, or: click a file to carry more charge
  chips: PacketChip[];
  // PICK ONE TO CARRY (WP8): the cards dealt for this crossing, each with what it does and why it was
  // offered, and the one picked (null until the kid picks; the send needs one when cards were dealt).
  cards: DraftCardView[];
  pick: UpgradeId | null;
  cardFile: CardFileChip | null;
}

// The order a file is offered in, safest to leave behind first (§6.9); locked files last.
const ROLE_DROP_ORDER = ['telemetry', 'autopilot', 'sensor', 'comms'] as const;
type DroppableRole = typeof ROLE_DROP_ORDER[number];

function isDroppableRole(role: string): role is DroppableRole {
  return (ROLE_DROP_ORDER as readonly string[]).includes(role);
}
const LOCKED_LAST = ROLE_DROP_ORDER.length + 2;
const UPGRADES_AFTER_ROLES = ROLE_DROP_ORDER.length + 1;

function dropOrder(kept: readonly Segment[], seg: Segment): number {
  if (dropLock(kept, seg) !== null) return LOCKED_LAST;
  if (seg.type === 'fs-tool') return 0;  // not locked: one of several copies
  const roleIndex = ROLE_DROP_ORDER.findIndex((role) => role === seg.role);
  // A COPY of an AI tool (ship 4 on) is a spare, as safe to leave as a .bak.
  if (roleIndex >= 0) return kept.filter((file) => toolKindOf(file) === toolKindOf(seg)).length > 1 ? 0 : roleIndex + 1;
  return UPGRADES_AFTER_ROLES;
}

function lockNote(lock: DropLock, seg: Segment): string {
  switch (lock) {
    case 'core': return TRANSMIT_TEXT.locked.core;
    case 'engine': return TRANSMIT_TEXT.locked.engine;
    case 'navplot': return TRANSMIT_TEXT.locked.navplot;
    case 'last-copy':
      if (seg.type !== 'fs-tool') throw new Error(`lockNote: ${seg.name} is a last copy but not a filesystem tool`);
      return TRANSMIT_TEXT.locked.lastCopy(TOOL_WORD[seg.fsTool]);
    case 'charge': throw new Error('lockNote: REPAIR CHARGE is not a chip (it fills the link)');
  }
}

// What leaving a file behind does (the chip's line): a spare copy is only a spare; an AI tool takes its
// job with it.
function effectNote(kept: readonly Segment[], seg: Segment): string {
  if (seg.type === 'fs-tool') return TRANSMIT_TEXT.spare(TOOL_WORD[seg.fsTool]);
  // The cards' files (WP8): what the unit would lose by leaving one behind.
  if (seg.type === 'firewall') return TRANSMIT_TEXT.withoutCard.firewall;
  if (seg.type === 'upgrade') return TRANSMIT_TEXT.withoutCard[seg.upgrade];
  const kind = toolKindOf(seg);
  if (kind !== null && kept.filter((file) => toolKindOf(file) === kind).length > 1 && seg.role) return TRANSMIT_TEXT.spare(seg.name.toUpperCase());
  if (!seg.role) return TRANSMIT_TEXT.noEffect;
  if (!isDroppableRole(seg.role)) throw new Error(`effectNote: ${seg.name} (${seg.role}) is not a file the unit can leave behind`);
  return TRANSMIT_TEXT.without[seg.role];
}

function requirePlan(state: Readonly<GameState>): TransitPlan {
  const plan = state.run.transit;
  if (state.run.phase !== 'transmit' || !plan) throw new Error(`transmit: no transmission is being prepared (phase ${state.run.phase})`);
  return plan;
}

// The ship the unit is leaving, as the run recorded it (endShip runs before goTransmit).
function lastOutcome(state: Readonly<GameState>): { outcome: ShipOutcome; ship: string } {
  const last = state.run.ships[state.run.ships.length - 1];
  if (!last) throw new Error('transmit: the run has no finished ship to transmit from');
  return { outcome: last.outcome, ship: last.shipName };
}

// `coreToll`: what the crash's emergency transmission takes from the Core (carry.ts crashCoreToll).
function whyLine(outcome: ShipOutcome, ship: string, coreToll: number): string | null {
  switch (outcome) {
    case 'locked':
    case 'partial': return null;
    case 'crashed': return TRANSMIT_TEXT.why.crashed(coreToll);
    case 'emergency': return TRANSMIT_TEXT.why.emergency;
    case 'abandoned': return TRANSMIT_TEXT.why.abandoned(ship);
    case 'escaped': return TRANSMIT_TEXT.why.escaped(ship);
    case 'stranded': return TRANSMIT_TEXT.why.stranded(ship);
  }
}

export function transmitModel(state: Readonly<GameState>): TransmitModel {
  const plan = requirePlan(state);
  const ship = getShip(plan.toShipIndex);
  if (!ship.arrival) throw new Error(`transmitModel: ${ship.name} has no link`);
  const live = unitFilesIn(state.memory).filter((seg) => seg.type !== 'redundancy');
  const kept = live.filter((seg) => !plan.dropped.includes(seg.id));
  // The picked card's file is in the packet too (WP8): it takes link room like the unit's own files.
  const packet = planPacket(state.memory, plan);
  const carriedWith = (dropped: readonly string[]): number => planPacket(state.memory, { ...plan, dropped }).chargeCarried;
  const chargeShort = packet.chargeHeld > packet.chargeCarried;

  const chips = live.map((seg): PacketChip & { order: number } => {
    const dropped = plan.dropped.includes(seg.id);
    const lock = dropped ? null : dropLock(kept, seg);
    const chargeGain = dropped
      ? packet.chargeCarried - carriedWith(plan.dropped.filter((id) => id !== seg.id))
      : lock === null ? carriedWith([...plan.dropped, seg.id]) - packet.chargeCarried : 0;
    return {
      segId: seg.id,
      name: seg.name,
      blocks: seg.size,
      integrity: hasIntegrity(seg) ? seg.integrity : null,
      infected: isInfected(seg),
      dropped,
      lock,
      toggleable: dropped || (lock === null && chargeGain > 0),
      note: lock !== null ? lockNote(lock, seg) : effectNote(kept, seg),
      chargeGain,
      order: dropped ? 0 : dropOrder(kept, seg),
    };
  });
  // Stable: files of one rank keep the packing order (the original before its copy).
  chips.sort((a, b) => a.order - b.order);

  const { outcome, ship: fromShip } = lastOutcome(state);
  const core = getAiCore(state);
  if (!core) throw new Error('transmitModel: the unit has no AI Core');
  const charge = arrivalCharge(packet.chargeCarried, state.run.pendingStarCredit, pickCharge(plan.pick));
  const infectedCount = chips.filter((chip) => chip.infected && !chip.dropped).length;
  return {
    toShipIndex: plan.toShipIndex,
    shipName: ship.name,
    distanceLy: ship.arrival.distanceLy,
    headline: TRANSMIT_TEXT.next(ship.name, shipColonists(ship), ship.arrival.distanceLy),
    why: whyLine(outcome, fromShip, crashCoreToll(core.integrity, plan.coreHit)),
    emergency: outcome === 'crashed' || outcome === 'emergency',
    link: plan.linkBlocks,
    files: packet.filesBlocks,
    chargeHeld: packet.chargeHeld,
    chargeCarried: packet.chargeCarried,
    packetLine: TRANSMIT_TEXT.packet(plan.linkBlocks, packet.filesBlocks, packet.chargeHeld, packet.chargeCarried),
    hitsLine: TRANSMIT_TEXT.hits(ship.arrival.transitHits + plan.extraHits),
    arrivalLine: TRANSMIT_TEXT.arrival(
      packet.chargeCarried, state.run.pendingStarCredit, state.run.pendingStars, charge.floorAdded, charge.blocks, pickCharge(plan.pick),
    ),
    arrivalCharge: charge.blocks,
    infectedLine: infectedCount > 0 ? TRANSMIT_TEXT.infected(infectedCount) : null,
    dropLine: chargeShort || plan.dropped.length > 0 ? TRANSMIT_TEXT.tight : TRANSMIT_TEXT.fits,
    chips: chips.map(({ order: _order, ...chip }) => chip),
    cards: plan.offer.map((card, i) => {
      const def = getUpgrade(card.id);
      return { ...card, tag: DRAFT_TEXT.form(def.form, def.blocks), key: String(i + 1), picked: card.id === plan.pick };
    }),
    pick: plan.pick,
    cardFile: cardFileChip(plan.pick),
  };
}

function cardFileChip(pick: UpgradeId | null): CardFileChip | null {
  const [file] = cardFiles(pick, PREVIEW_ID);
  return file === undefined ? null : { name: file.name, blocks: file.size };
}

// Why a chip did not toggle.
export type DropRefusal = 'locked' | 'nothing-to-gain';

// A click on a chip: leave the file behind (if that carries more charge), or take it back. One update;
// the packet's numbers are worked out again from the new list (packUnit throws on a locked drop).
export function toggleDrop(store: Store<GameState>, segId: string): DropRefusal | null {
  const state = store.getState();
  const chip = transmitModel(state).chips.find((candidate) => candidate.segId === segId);
  if (!chip) throw new Error(`toggleDrop: ${segId} is not one of the packed files`);
  if (!chip.toggleable) return chip.lock !== null ? 'locked' : 'nothing-to-gain';
  const plan = requirePlan(state);
  const dropped = chip.dropped ? plan.dropped.filter((id) => id !== segId) : [...plan.dropped, segId];
  const packet = planPacket(state.memory, { ...plan, dropped });
  store.update((draft) => {
    if (!draft.run.transit) throw new Error('toggleDrop: the transit plan vanished');
    draft.run.transit.dropped = dropped;
    draft.run.transit.filesBlocks = packet.filesBlocks;
    draft.run.transit.chargeCarried = packet.chargeCarried;
  });
  return null;
}
