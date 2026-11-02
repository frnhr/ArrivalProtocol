import type { Store } from '@state/store';
import type { GameState, ShipOutcome, TransitPlan } from '@state/schema';
import type { Segment } from '@/types/segment';
import type { RoomFit } from '@/types/map';
import { unitFilesIn, dropLock, toolKindOf, arrivalCharge, crashCoreToll, type DropLock } from '@systems/carry';
import { planPacket, pickCharge, cardFiles, PREVIEW_ID } from '@systems/draft';
import { getUpgrade, type DraftCard, type UpgradeId } from '@data/upgrades';
import { hasIntegrity, isInfected, getAiCore } from '@state/selectors';
import { shipSummaryAt } from '@systems/map-run';
import { hitsLanding } from '@systems/map-hop';
import { unitArrival, type ArrivalPreview } from '@systems/arrival-preview';
import { MAP_TEXT } from '@data/map-text';
import { TOOL_WORD } from '@data/fs-tools';
import { TRANSMIT_TEXT, DRAFT_TEXT } from '@data/script';
import { LOG_TEXT } from '@data/log-text';
import { THREAT_TEXT } from '@data/threat-text';
import { noWorkingRm } from '@state/threat-selectors';
import { hollowLabel } from '@systems/say';
import { logChip } from '@systems/log-view';
import { TRACE_BOARD_AT } from '@data/tuning';
import { REPO_FILES } from '@data/repository';
import { REPO_TEXT } from '@data/repo-text';
import { hopOutlook } from '@systems/repository';
import type { DeliveryChip } from '@/types/repo';

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
// Phase 3 slice 2 (04 §3.3, §3.7, §3.8, §4; 05 §3.2): the threat the beam carries, read from TransitPlan.threat (the
// ladder's verdict for the next ship) and the tally the last ship's end applied (run.threat):
// • the uninvited chip when HOLLOW rides this beam (`??? · 10 BLOCKS · NOT YOURS · RIDES FREE`): it crosses at the size
//   it will have (threat.rootBlocks), costs no link room, and says why it grew (`+2: 2 SEEDS FED IT`, lastTally.left);
// • 046.log's chip as `046.log · 3/12`, locked, glowing while an entry is unread (a click opens the LOG READER);
// • `NO RM · YOU CAN'T DELETE THE ROOT` before the beam to the final ship when no working rm is aboard (information);
// • the TRACE line: the meter, `1 MORE AND IT FINDS YOU`, or `HOLLOW WILL FIND YOU ON THIS BEAM` on a boarding beam.
// Phase 3 slice 3a (02-map §4; 01-landing §3.16): the PACKET between the DESK and the beam.
// • the years headline on the arm (`NEXT: KESTREL · 1,200 COLONISTS · 26 LY · 89 YRS EARLY`) and the ECC line in place of
//   the hits line (`ON THE WAY: 4 HITS · ECC FIXES 3 WHILE YOU SLEEP (89 YRS) → 1 LANDS`); the classic world keeps
//   phase 2's (its hops have no years);
// • the room bar beside the link bar (systems/map-hop.ts roomFit on the packet as it would cross: `ROOM 152 · FILES 65 +
//   FLOOR 12`), with the charge it costs named before it happens (`CHARGE 38 → 12 ON ARRIVAL · 26 WON'T FIT`); on a
//   TIGHT ship whose room leaves no charge, `→ 0 ON ARRIVAL` in red, and TRANSMIT ▸ asks first (the screen's inline
//   confirm, `ARRIVE WITH NO REPAIR CHARGE?`);
// • TRANSMIT ▸ waits while files plus the floor are over the room (`20 TOO MANY FOR THE ROOM · LEAVE FILES BEHIND`), or
//   files are over the link (`8 TOO MANY FOR THE LINK · …`: a unit grown past a short hop's link, the review's B1), and a
//   file can then be left behind even when that buys no charge (toggleDrop);
// • every arrival number (the arrival line, the room line, the confirm) is systems/arrival-preview.ts's, from one roomFit
//   (the review's M1: the room line and the arrival line said 20 and 54);
// • a file left behind on a squeezing room shows the charge it lets arrive (`+6 CHARGE`), not only what it lets cross.

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
  // REPAIR CHARGE leaving it behind lets ARRIVE (slice 3a: the destination's room can squeeze what crossed); at least
  // chargeGain wherever the room does not bind.
  arriveGain: number;
  // 046.log (slice 2): its chip glows while an entry is unread, and a click opens the LOG READER instead of a drop.
  log: boolean;
  glow: boolean;
}

// HOLLOW riding this beam (04 §3.8): a locked chip that costs no link room, at the size it will land with.
export interface UninvitedChip {
  owner: string;          // ??? until it named itself
  blocks: number;
  fed: number;            // beam-born blocks the last ship's end fed it (0: none)
  boards: boolean;        // it boards on this beam (the boarding moment: the stutter in the sweep)
  text: string;           // ??? · 10 BLOCKS · NOT YOURS · RIDES FREE
  note: string;           // NOT YOURS · RIDES FREE
  fedText: string | null; // ??? 12 BLOCKS · +2: 2 SEEDS FED IT
}

// The PACKET's TRACE line: the meter (`TRACE ■■□ · 1 MORE AND IT FINDS YOU`), or the boarding beam's warning.
export interface PacketTraceLine {
  text: string;
  tone: 'quiet' | 'warn' | 'boards';
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
  // Slice 2: the threat the beam carries.
  uninvited: UninvitedChip | null;
  noRm: string | null;
  trace: PacketTraceLine | null;
  // Slice 3a: the destination's room (every hop has one: the classic world's FULL ships never squeeze) and the years.
  arm: boolean;
  room: PacketRoom;
  onTheWay: string | null;     // the ECC line on the arm (null on the classic world: hitsLine says it)
  // Slice 3b (02 §3.9, §4; plan §1.1 item 14): the DELIVERIES chip row (the plan's chips, oldest first; empty on the
  // classic world), the IN TRANSIT line (requests still behind the unit after this hop: null when none) and the draft's
  // heading (SALVAGE on the arm, null on the classic world: PICK ONE TO CARRY as before).
  deliveries: DeliveryChipView[];
  inTransit: string | null;
  salvageTitle: string | null;
}

// One delivery chip on the PACKET: `Mv · 2 BLOCKS · ARRIVED 2337` and its SEND ON toggle. `lost`: sent on from a hop into a
// final ship, where no hop follows (the label says `NO SHIP AFTER LAST LIGHT · IT IS LOST`).
export interface DeliveryChipView {
  key: string;
  file: DeliveryChip['file'];
  name: string;
  blocks: number;
  text: string;
  sendOn: boolean;
  lost: boolean;
  sendOnLabel: string;         // [SEND ON] / SENT ON · RIDES YOUR NEXT HOP / NO SHIP AFTER … · IT IS LOST
}

// The PACKET's room bar (01 §3.16): the packet against the destination's room, and what it costs the charge; the words
// are the arrival preview's (systems/arrival-preview.ts).
export interface PacketRoom {
  fit: RoomFit;
  line: string;                // ROOM 152 · FILES 65 + FLOOR 12 / ROOM 88 · FILES 73 · NO FLOOR
  charge: string | null;       // CHARGE 38 → 12 ON ARRIVAL · 26 WON'T FIT, or → 0 ON ARRIVAL; null when all of it fits
  tone: 'quiet' | 'squeezed' | 'zero' | 'over';
  tooMany: string | null;      // 20 TOO MANY FOR THE ROOM (or LINK) · LEAVE FILES BEHIND: TRANSMIT ▸ waits
  confirm: string | null;      // the charge may arrive at 0: TRANSMIT ▸ asks this first (ARRIVE WITH NO REPAIR CHARGE?)
}

// The chip's words after the owner (THREAT_TEXT.uninvitedChip reads `owner · n BLOCKS · NOT YOURS · RIDES FREE`).
const UNINVITED_NOTE_FROM = ' BLOCKS · ';

function uninvitedChip(state: Readonly<GameState>, plan: TransitPlan): UninvitedChip | null {
  const blocks = plan.threat.rootBlocks;
  if (blocks === null) return null;
  const owner = hollowLabel(state.run);
  const tally = state.run.threat.lastTally;
  // Into a final ship feeding changes nothing (its root is the FINALE's 16 whatever it ate: threat-plan.ts rootBlocksFor),
  // so the chip never says SEEDS FED IT there (the review's minor 3).
  const fed = tally !== null && tally.fed && !plan.threat.isFinal ? tally.left : 0;
  const text = THREAT_TEXT.uninvitedChip(owner, blocks);
  const cut = text.indexOf(UNINVITED_NOTE_FROM);
  if (cut < 0) throw new Error(`uninvitedChip: the chip's words changed shape: ${text}`);
  return {
    owner, blocks, fed, boards: plan.threat.boards !== null, text, note: text.slice(cut + UNINVITED_NOTE_FROM.length),
    fedText: fed > 0 ? THREAT_TEXT.uninvitedFed(owner, blocks, fed) : null,
  };
}

// HOLLOW boarding on this beam is said outright (the map card's line, 04 §3.8: the surprise is what it does, not that it
// comes), worded by its cause: TRACE full (`HOLLOW WILL FIND YOU ON THIS BEAM`), or forced one hop from a final ship,
// where TRACE did not do it (`IT FOUND YOU ANYWAY`: the review's minor 2; the fixed five always board forced). A beam it
// already rides needs no line (its chip is there). Otherwise the meter, once TRACE has counted or the last ship's end
// tallied a seed; nothing on a run that has met no seed.
function packetTraceLine(state: Readonly<GameState>, plan: TransitPlan): PacketTraceLine | null {
  const trace = state.run.threat.trace;
  if (plan.threat.boards !== null) {
    const why = plan.threat.boards === 'forced' ? THREAT_TEXT.foundYouAnyway : THREAT_TEXT.willFindYou;
    return { text: `${THREAT_TEXT.trace(trace)} · ${why}`, tone: 'boards' };
  }
  if (plan.threat.rootBlocks !== null) return null;
  const tallied = (state.run.threat.lastTally?.left ?? 0) > 0;
  if (trace === 0 && !tallied) return null;
  if (trace === TRACE_BOARD_AT - 1) return { text: `${THREAT_TEXT.trace(trace)} · ${THREAT_TEXT.traceOneMore}`, tone: 'warn' };
  return { text: THREAT_TEXT.trace(trace), tone: trace >= TRACE_BOARD_AT ? 'warn' : 'quiet' };
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
    case 'log': return LOG_TEXT.packetLock;
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

// The packet's fit to the destination's link and room (systems/arrival-preview.ts unitArrival, the one preview): its
// files as they would cross (the card's file in them), the charge held, the star credit and the card's charge, and the
// room the beam's seeds could take by the verdict.
export function packetArrival(state: Readonly<GameState>, plan: Readonly<TransitPlan>, dropped: readonly string[] = plan.dropped): ArrivalPreview {
  return unitArrival(state, { hop: plan.hop, threat: plan.threat, dropped, pick: plan.pick, deliveries: plan.deliveries });
}

export function packetFit(state: Readonly<GameState>, plan: Readonly<TransitPlan>, dropped: readonly string[] = plan.dropped): RoomFit {
  return packetArrival(state, plan, dropped).fit;
}

function packetRoom(preview: Readonly<ArrivalPreview>): PacketRoom {
  const fit = preview.fit;
  const line = fit.floor > 0 ? MAP_TEXT.packet.room(fit.room, fit.files, fit.floor) : MAP_TEXT.packet.roomNoFloor(fit.room, fit.files);
  return { fit, line, charge: preview.charge, tone: preview.tone, tooMany: preview.tooMany, confirm: preview.confirm };
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
  const ship = shipSummaryAt(state.run.map, plan.toSlot);
  const live = unitFilesIn(state.memory).filter((seg) => seg.type !== 'redundancy');
  const kept = live.filter((seg) => !plan.dropped.includes(seg.id));
  // The picked card's file is in the packet too (WP8): it takes link room like the unit's own files.
  const packet = planPacket(state.memory, plan);
  const carriedWith = (dropped: readonly string[]): number => planPacket(state.memory, { ...plan, dropped }).chargeCarried;
  const chargeShort = packet.chargeHeld > packet.chargeCarried;
  const preview = packetArrival(state, plan);
  const fit = preview.fit;
  const arrivesWith = (dropped: readonly string[]): number => packetFit(state, plan, dropped).chargeArrives;

  const log = logChip(state);
  const chips = live.map((seg): PacketChip & { order: number } => {
    const dropped = plan.dropped.includes(seg.id);
    const isLog = seg.type === 'log';
    const lock = dropped ? null : dropLock(kept, seg);
    const chargeGain = dropped
      ? packet.chargeCarried - carriedWith(plan.dropped.filter((id) => id !== seg.id))
      : lock === null ? carriedWith([...plan.dropped, seg.id]) - packet.chargeCarried : 0;
    const arriveGain = dropped
      ? fit.chargeArrives - arrivesWith(plan.dropped.filter((id) => id !== seg.id))
      : lock === null ? arrivesWith([...plan.dropped, seg.id]) - fit.chargeArrives : 0;
    return {
      segId: seg.id,
      name: isLog ? log.label : seg.name,
      blocks: seg.size,
      integrity: hasIntegrity(seg) ? seg.integrity : null,
      infected: isInfected(seg),
      dropped,
      lock,
      // A drop is offered while it buys charge across the link or on arrival, or while files are over the room or the
      // link (then it is needed whatever it buys: 01 §3.16, the review's B1; TRANSMIT ▸ waits).
      toggleable: dropped || (lock === null && (chargeGain > 0 || arriveGain > 0 || fit.over > 0 || fit.overLink > 0)),
      note: lock !== null ? lockNote(lock, seg) : effectNote(kept, seg),
      chargeGain,
      arriveGain,
      log: isLog,
      glow: isLog && log.glow,
      order: dropped ? 0 : dropOrder(kept, seg),
    };
  });
  // Stable: files of one rank keep the packing order (the original before its copy).
  chips.sort((a, b) => a.order - b.order);

  const { outcome, ship: fromShip } = lastOutcome(state);
  const core = getAiCore(state);
  if (!core) throw new Error('transmitModel: the unit has no AI Core');
  // What arrives before the room has its say, on the destination's own floor (01 §3.16: none on a TIGHT ship), as the
  // arrival counts it; roomFit's `wanted` is the same number (asserted: the room bar and this line must agree).
  const charge = arrivalCharge(packet.chargeCarried, state.run.pendingStarCredit, pickCharge(plan.pick), plan.hop.chargeFloor);
  if (charge.blocks !== fit.wanted) throw new Error(`transmitModel: arrival charge ${charge.blocks} but the room bar wants ${fit.wanted}`);
  const infectedCount = chips.filter((chip) => chip.infected && !chip.dropped).length;
  const arm = state.run.map.world === 'arm';
  const room = packetRoom(preview);
  const hits = plan.hop.transitHits + plan.extraHits;
  return {
    toShipIndex: plan.toShipIndex,
    shipName: ship.name,
    distanceLy: plan.hop.distanceLy,
    headline: arm
      ? MAP_TEXT.packet.headline(ship.name, ship.colonists, plan.hop.distanceLy, plan.hop.slackYears)
      : TRANSMIT_TEXT.next(ship.name, ship.colonists, plan.hop.distanceLy),
    why: whyLine(outcome, fromShip, crashCoreToll(core.integrity, plan.coreHit)),
    emergency: outcome === 'crashed' || outcome === 'emergency',
    link: plan.linkBlocks,
    files: packet.filesBlocks,
    chargeHeld: packet.chargeHeld,
    chargeCarried: packet.chargeCarried,
    packetLine: TRANSMIT_TEXT.packet(plan.linkBlocks, packet.filesBlocks, packet.chargeHeld, packet.chargeCarried, fit.roomLost > 0),
    hitsLine: TRANSMIT_TEXT.hits(hits),
    arrivalLine: preview.sum,
    arrivalCharge: fit.chargeArrives,
    infectedLine: infectedCount > 0 ? TRANSMIT_TEXT.infected(infectedCount) : null,
    dropLine: room.tooMany !== null ? room.tooMany
      : chargeShort || plan.dropped.length > 0 || fit.roomLost > 0 ? TRANSMIT_TEXT.tight : TRANSMIT_TEXT.fits,
    chips: chips.map(({ order: _order, ...chip }) => chip),
    cards: plan.offer.map((card, i) => {
      const def = getUpgrade(card.id);
      return { ...card, tag: DRAFT_TEXT.form(def.form, def.blocks), key: String(i + 1), picked: card.id === plan.pick };
    }),
    pick: plan.pick,
    cardFile: cardFileChip(plan.pick),
    uninvited: uninvitedChip(state, plan),
    noRm: plan.threat.isFinal && noWorkingRm(state) ? THREAT_TEXT.noRmPacket : null,
    trace: packetTraceLine(state, plan),
    arm,
    room,
    onTheWay: arm ? MAP_TEXT.packet.onTheWay(hits, plan.hop.eccFixes, plan.hop.slackYears, hitsLanding(plan.hop, plan.extraHits)) : null,
    deliveries: plan.deliveries.map((chip) => deliveryChipView(chip, ship.name, ship.final)),
    inTransit: arm ? inTransitLine(state, plan) : null,
    salvageTitle: arm ? REPO_TEXT.packet.salvage : null,
  };
}

function deliveryChipView(chip: Readonly<DeliveryChip>, shipName: string, intoFinal: boolean): DeliveryChipView {
  const name = REPO_FILES[chip.file].name;
  const lost = chip.sendOn && intoFinal;
  return {
    key: chip.key, file: chip.file, name, blocks: chip.blocks, text: REPO_TEXT.packet.chip(name, chip.blocks, chip.arrivedYear),
    sendOn: chip.sendOn, lost,
    sendOnLabel: lost ? REPO_TEXT.packet.lostAfter(shipName) : chip.sendOn ? REPO_TEXT.packet.sentOn : REPO_TEXT.packet.sendOn,
  };
}

// The PACKET's IN TRANSIT line: the requests the hop's outlook leaves behind the unit (late or never; the pick is not one
// yet: its ETA is the REPOSITORY's), from the one rule (systems/repository.ts hopOutlook).
function inTransitLine(state: Readonly<GameState>, plan: Readonly<TransitPlan>): string | null {
  const behind = hopOutlook(state, plan.hop.from, plan.toSlot).filter((entry) => !entry.rides && entry.source === 'in-transit');
  if (behind.length === 0) return null;
  if (behind.length > 1) return REPO_TEXT.packet.inTransitMore(behind.length);
  return REPO_TEXT.packet.inTransit(REPO_FILES[behind[0]!.file].name, behind[0]!.yearsLate);
}

function cardFileChip(pick: UpgradeId | null): CardFileChip | null {
  const [file] = cardFiles(pick, PREVIEW_ID);
  return file === undefined ? null : { name: file.name, blocks: file.size };
}

// Why a delivery chip's SEND ON did not toggle (Track REPO may add reasons).
export type SendOnRefusal = 'no-chip';

// The PACKET's SEND ON on delivery chip `key` (02 §3.9; slice-3b-plan §1.1 item 8): the file stays in the destination's
// receiver to ride the unit's next hop (on a hop into a final ship there is none: it is lost, and the tally lists it), or
// comes back into the packet. One update: the chip and the plan's filesBlocks / chargeCarried worked out again by
// planPacket. Track REPO fills it (`TODO(3b-REPO)`).
export function toggleSendOn(store: Store<GameState>, key: string): SendOnRefusal | null {
  const plan = requirePlan(store.getState());
  if (!plan.deliveries.some((chip) => chip.key === key)) return 'no-chip';
  throw new Error('TODO(3b-REPO): toggleSendOn');
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
