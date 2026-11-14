// Slice 4: Track TREE owns this file (docs/phase3/impl/slice-4-plan.md §5.2): skill chips, the drop order, the PACK AS
// model. Others ask by message.
import type { Store } from '@state/store';
import type { GameState, ShipOutcome, TransitPlan } from '@state/schema';
import type { Segment } from '@/types/segment';
import type { RoomFit } from '@/types/map';
import { unitFilesIn, dropLock, toolKindOf, arrivalCharge, crashCoreToll, type DropLock, type Packet } from '@systems/carry';
import { traceGiftCharge } from '@systems/trace-gifts';
import { transitPacket, pickCharge, cardFiles, PREVIEW_ID } from '@systems/draft';
import { skillPacketPlan, lowerLevels } from '@systems/skill-files';
import { held, restoreCostOf } from '@systems/skill-tree';
import { isSkillFile } from '@state/selectors';
import { SKILL_TREE, skillBlocks } from '@data/skills';
import { PACKET_SKILL_TEXT } from '@data/training-text';
import type { SkillId, SkillLevel } from '@/types/skill';
import type { SkillFileSegment } from '@/types/segment';
import { getUpgrade, type DraftCard, type DraftCardId } from '@data/upgrades';
import { RESIDENT_UI_TEXT } from '@data/resident-ui-text';
import { hasIntegrity, isInfected, getAiCore } from '@state/selectors';
import { shipSummaryAt } from '@systems/map-run';
import { unknownShown } from '@systems/signals';
import { hitsLanding, cardArrives } from '@systems/map-hop';
import { unitArrival, type ArrivalPreview } from '@systems/arrival-preview';
import { MAP_TEXT } from '@data/map-text';
import { TOOL_WORD } from '@data/fs-tools';
import { TRANSMIT_TEXT, DRAFT_TEXT } from '@data/script';
import { bookPacketLock } from '@data/log-books';
import { THREAT_TEXT } from '@data/threat-text';
import { noWorkingRm } from '@state/threat-selectors';
import { hollowLabel } from '@systems/say';
import { logChip } from '@systems/log-view';
import { TRACE_BOARD_AT } from '@data/tuning';
import { REPO_FILES } from '@data/repository';
import { REPO_TEXT } from '@data/repo-text';
import { hopOutlook, markFirstOfKind, deliverySeedChance } from '@systems/repository';
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
// • the uninvited chip when HOLLOW rides this beam (`??? · 10 BLOCKS · NOT IN YOUR PACKET`): it crosses at the size
//   it will have (threat.rootBlocks), costs no link room, and says why it grew (`+2: 2 SEEDS FED IT`, lastTally.left);
// • 046.log's chip as `046.log · 3/12`, locked, glowing while an entry is unread (a click opens the LOG READER);
// • `NO RM · YOU CAN'T DELETE THE ROOT` before the beam to the final ship when no working rm is aboard (information);
// • the TRACE line: the meter, `1 MORE AND IT FINDS YOU`, or `??? WILL FIND YOU ON THIS BEAM` on a boarding beam.
// Phase 3 slice 3a (02-map §4; 01-landing §3.16): the PACKET between the DESK and the beam.
// • the years headline on the arm (`NEXT: KESTREL · 1,200 COLONISTS · 26 LY · SLEEP 89 YRS`) and the ECC line in place of
//   the hits line (`ON THE WAY: 4 HITS · ECC FIXES 3 WHILE YOU SLEEP (89 YRS) → 1 LANDS`);
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
  // Slice 4: a skill file's chip (null for every other file): its level as it crosses, what leaving it costs, PACK AS.
  skill: SkillChip | null;
}

// A skill file on the PACKET (03 §3.4, plan §2.6): `AUTOBURN.skl v2 (9) → brake by hand · RESTORE 5`, with `PACK AS v1 (7) ·
// RESTORE 3` beside it. A file trained at this desk is its fresh file, locked ('trained': UNDO is the way back), with no
// PACK AS; the file it replaces has no chip.
export interface SkillChip {
  skill: SkillId;
  level: SkillLevel;            // as it crosses (a packed chip's lower level)
  nominal: SkillLevel;          // the file's own level in memory (the fresh file's, for a trained chip)
  trained: boolean;
  packedAs: SkillLevel | null;  // PACK AS in effect (null: it crosses as it is)
  restore: number;              // the RESTORE the next desk asks if it is left behind
  without: string;              // what leaving it costs the kid (`brake by hand`): the view composes the loss with restore
  packAs: PackAsOption[];       // the lower levels it may cross as, highest first (none on a trained chip)
}

// One PACK AS button (setPackAs(segId, level); the active one takes it back with null).
export interface PackAsOption {
  level: SkillLevel;
  blocks: number;
  restore: number;              // the RESTORE the next desk asks if it crosses at this level
  active: boolean;
  text: string;                 // PACK AS v1 (7) · RESTORE 3
}

// HOLLOW riding this beam (04 §3.8): a locked chip that costs no link room, at the size it will land with.
export interface UninvitedChip {
  owner: string;          // ??? until it named itself
  blocks: number;
  fed: number;            // beam-born blocks the last ship's end fed it (0: none)
  boards: boolean;        // it boards on this beam (the boarding moment: the stutter in the sweep)
  text: string;           // ??? · 10 BLOCKS · NOT IN YOUR PACKET
  note: string;           // NOT IN YOUR PACKET
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
  // Playtest 1 (Q19): a charge card the destination's room cannot take whole says so on itself (`+12 · ONLY 4 FIT ON
  // HALCYON`), picked or not; null when all of it would arrive, and for every other card.
  fitNote: string | null;
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
  pick: DraftCardId | null;
  cardFile: CardFileChip | null;
  // Slice 2: the threat the beam carries.
  uninvited: UninvitedChip | null;
  noRm: string | null;
  trace: PacketTraceLine | null;
  // Slice 3a: the destination's room and the years.
  room: PacketRoom;
  onTheWay: string;            // the ECC line
  // Slice 3b (02 §3.9, §4; plan §1.1 item 14): the DELIVERIES chip row (the plan's chips, oldest first), the IN TRANSIT
  // line (requests still behind the unit after this hop: null when none) and the draft's heading (SALVAGE).
  deliveries: DeliveryChipView[];
  inTransit: string | null;
  salvageTitle: string;
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
  // Playtest 1 (Q19): the picked card's charge that arrives (the room bar's `+12` segment, inside the charge's); null when
  // no charge card is picked.
  card: { blocks: number; arrives: number; label: string } | null;
}

// The chip's words after the owner (THREAT_TEXT.uninvitedChip reads `owner · n BLOCKS · NOT IN YOUR PACKET`).
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
// comes), worded by its cause: TRACE full (`??? WILL FIND YOU ON THIS BEAM`), or forced one hop from a final ship,
// where TRACE did not do it (`IT FOUND YOU ANYWAY`: the review's minor 2; the fixed five always board forced). A beam it
// already rides needs no line (its chip is there). Otherwise the meter, once TRACE has counted or the last ship's end
// tallied a seed; nothing on a run that has met no seed.
function packetTraceLine(state: Readonly<GameState>, plan: TransitPlan): PacketTraceLine | null {
  const trace = state.run.threat.trace;
  if (plan.threat.boards !== null) {
    const why = plan.threat.boards === 'forced' ? THREAT_TEXT.foundYouAnyway : THREAT_TEXT.willFindYou(hollowLabel(state.run));
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
const LOCKED_LAST = ROLE_DROP_ORDER.length + 3;
const UPGRADES_AFTER_ROLES = ROLE_DROP_ORDER.length + 1;
// Slice 4 (03 §3.4): skills come last in the safest-to-drop order (a lost skill costs cycles to RESTORE).
const SKILLS_LAST = ROLE_DROP_ORDER.length + 2;

function dropOrder(kept: readonly Segment[], seg: Segment): number {
  if (dropLock(kept, seg) !== null) return LOCKED_LAST;
  if (isSkillFile(seg)) return SKILLS_LAST;
  if (seg.type === 'fs-tool') return 0;  // not locked: one of several copies
  const roleIndex = ROLE_DROP_ORDER.findIndex((role) => role === seg.role);
  // A COPY of an AI tool (ship 4 on) is a spare, as safe to leave as a .bak.
  if (roleIndex >= 0) return kept.filter((file) => toolKindOf(file) === toolKindOf(seg)).length > 1 ? 0 : roleIndex + 1;
  return UPGRADES_AFTER_ROLES;
}

function lockNote(state: Readonly<GameState>, lock: DropLock, seg: Segment): string {
  switch (lock) {
    case 'core': return TRANSMIT_TEXT.locked.core;
    case 'engine': return TRANSMIT_TEXT.locked.engine;
    case 'navplot': return TRANSMIT_TEXT.locked.navplot;
    case 'last-copy':
      if (seg.type !== 'fs-tool') throw new Error(`lockNote: ${seg.name} is a last copy but not a filesystem tool`);
      return TRANSMIT_TEXT.locked.lastCopy(TOOL_WORD[seg.fsTool]);
    case 'charge': throw new Error('lockNote: REPAIR CHARGE is not a chip (it fills the link)');
    case 'log': return bookPacketLock(state.run.log.book);   // slice 7c (R37): the book's own unit
    case 'trained': return PACKET_SKILL_TEXT.trainedHere;
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
  return unitArrival(state, { hop: plan.hop, threat: plan.threat, dropped, pick: plan.pick, deliveries: plan.deliveries, packAs: packAsWithout(plan.packAs, dropped) });
}

// PACK AS on the files still going: a file left behind crosses at no level (toggleDrop forgets its PACK AS; the chips'
// what-if numbers drop a packed file the same way).
function packAsWithout(packAs: Readonly<TransitPlan['packAs']>, dropped: readonly string[]): TransitPlan['packAs'] {
  return Object.fromEntries(Object.entries(packAs).filter(([segId]) => !dropped.includes(segId)));
}

// The plan with `dropped` left behind (the chips' what-ifs and toggleDrop).
function withDropped(plan: Readonly<TransitPlan>, dropped: readonly string[]): TransitPlan {
  return { ...plan, dropped: [...dropped], packAs: packAsWithout(plan.packAs, dropped) };
}

export function packetFit(state: Readonly<GameState>, plan: Readonly<TransitPlan>, dropped: readonly string[] = plan.dropped): RoomFit {
  return packetArrival(state, plan, dropped).fit;
}

// The packet is over the link or the room while a delivery rides in it (a chip not sent on): SEND ON is a way back under
// as well as leaving files behind, so the gate line and the arrival line say both (review m3: they said LEAVE FILES BEHIND
// only, and the chip that pushed the packet over sat right above them).
function sendOnHelps(plan: Readonly<TransitPlan>, preview: Readonly<ArrivalPreview>): boolean {
  return preview.tooMany !== null && plan.deliveries.some((chip) => !chip.sendOn);
}

// Playtest 1 (Q19): what a charge card would bring if picked, against the room as the packet stands with that pick (the
// card's note says what the room cannot take); null for any other card, or when all of it would arrive.
function cardFitNote(state: Readonly<GameState>, plan: Readonly<TransitPlan>, id: DraftCardId, ship: string): string | null {
  const blocks = pickCharge(id);
  if (blocks === 0) return null;
  const fit = unitArrival(state, { hop: plan.hop, threat: plan.threat, dropped: plan.dropped, pick: id, deliveries: plan.deliveries, packAs: plan.packAs }).fit;
  if (fit.word === 'leave') return null;
  const arrives = cardArrives(fit, blocks);
  return arrives < blocks ? TRANSMIT_TEXT.cardFits(blocks, arrives, ship) : null;
}

function packetRoom(preview: Readonly<ArrivalPreview>, plan: Readonly<TransitPlan>): PacketRoom {
  const fit = preview.fit;
  const line = fit.floor > 0 ? MAP_TEXT.packet.room(fit.room, fit.files, fit.floor) : MAP_TEXT.packet.roomNoFloor(fit.room, fit.files);
  const tooMany = sendOnHelps(plan, preview) ? REPO_TEXT.packet.overWithDeliveries(Math.max(fit.overLink, fit.over)) : preview.tooMany;
  const blocks = pickCharge(plan.pick);
  const arrives = blocks > 0 ? cardArrives(fit, blocks) : 0;
  const card = blocks > 0 ? { blocks, arrives, label: TRANSMIT_TEXT.cardSegment(arrives) } : null;
  return { fit, line, charge: preview.charge, tone: preview.tone, tooMany, confirm: preview.confirm, card };
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
  // Slice 4: a file a purchase at this desk replaces has no chip (its fresh file has one, locked: trainedChips).
  const skillPlan = skillPacketPlan(state, plan.packAs);
  const replaced = skillPlan.fresh.map((entry) => entry.replaces).filter((id): id is string => id !== null);
  const live = unitFilesIn(state.memory).filter((seg) => seg.type !== 'redundancy' && !replaced.includes(seg.id));
  const kept = live.filter((seg) => !plan.dropped.includes(seg.id));
  // The picked card's file is in the packet too (WP8): it takes link room like the unit's own files.
  const packet = transitPacket(state, plan);
  const carriedWith = (dropped: readonly string[]): number => transitPacket(state, withDropped(plan, dropped)).chargeCarried;
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
    const skill = isSkillFile(seg) ? skillChip(state, seg, plan.packAs[seg.id] ?? null) : null;
    return {
      segId: seg.id,
      name: isLog ? log.label : seg.name,
      blocks: skill === null ? seg.size : skillBlocks(skill.skill, skill.level.version, skill.level.lock),
      integrity: hasIntegrity(seg) ? seg.integrity : null,
      infected: isInfected(seg),
      dropped,
      lock,
      // A drop is offered while it buys charge across the link or on arrival, or while files are over the room or the
      // link (then it is needed whatever it buys: 01 §3.16, the review's B1; TRANSMIT ▸ waits).
      toggleable: dropped || (lock === null && (chargeGain > 0 || arriveGain > 0 || fit.over > 0 || fit.overLink > 0)),
      note: lock !== null ? lockNote(state, lock, seg) : skill !== null ? skillNote(skill) : effectNote(kept, seg),
      chargeGain,
      arriveGain,
      log: isLog,
      glow: isLog && log.glow,
      skill,
      order: dropped ? 0 : dropOrder(kept, seg),
    };
  });
  chips.push(...trainedChips(state, packet).map((chip) => ({ ...chip, order: LOCKED_LAST })));
  // Stable: files of one rank keep the packing order (the original before its copy).
  chips.sort((a, b) => a.order - b.order);

  const { outcome, ship: fromShip } = lastOutcome(state);
  const core = getAiCore(state);
  if (!core) throw new Error('transmitModel: the unit has no AI Core');
  // What arrives before the room has its say, on the destination's own floor (01 §3.16: none on a TIGHT ship), as the
  // arrival counts it; roomFit's `wanted` is the same number (asserted: the room bar and this line must agree).
  const charge = arrivalCharge(packet.chargeCarried, state.run.pendingStarCredit, pickCharge(plan.pick), plan.hop.chargeFloor, traceGiftCharge(state, plan.toSlot));
  if (charge.blocks !== fit.wanted) throw new Error(`transmitModel: arrival charge ${charge.blocks} but the room bar wants ${fit.wanted}`);
  const infectedCount = chips.filter((chip) => chip.infected && !chip.dropped).length;
  const room = packetRoom(preview, plan);
  const hits = plan.hop.transitHits + plan.extraHits;
  return {
    toShipIndex: plan.toShipIndex,
    shipName: ship.name,
    distanceLy: plan.hop.distanceLy,
    // A `?` ship keeps its colonists to itself until its boot names them (slice 8 POLISH; its SHIP CARD's `??? COLONISTS`).
    headline: MAP_TEXT.packet.headline(ship.name, unknownShown(state.run, plan.toSlot) ? null : ship.colonists, plan.hop.distanceLy, plan.hop.slackYears),
    why: whyLine(outcome, fromShip, crashCoreToll(core.integrity, plan.coreHit)),
    emergency: outcome === 'crashed' || outcome === 'emergency',
    link: plan.linkBlocks,
    files: packet.filesBlocks,
    chargeHeld: packet.chargeHeld,
    chargeCarried: packet.chargeCarried,
    packetLine: TRANSMIT_TEXT.packet(plan.linkBlocks, packet.filesBlocks, packet.chargeHeld, packet.chargeCarried, fit.roomLost > 0),
    hitsLine: TRANSMIT_TEXT.hits(hits),
    arrivalLine: sendOnHelps(plan, preview) ? REPO_TEXT.packet.arrivalOverWithDeliveries : preview.sum,
    arrivalCharge: fit.chargeArrives,
    infectedLine: infectedCount > 0 ? TRANSMIT_TEXT.infected(infectedCount) : null,
    dropLine: room.tooMany !== null ? room.tooMany
      : chargeShort || plan.dropped.length > 0 || fit.roomLost > 0 ? TRANSMIT_TEXT.tight : TRANSMIT_TEXT.fits,
    chips: chips.map(({ order: _order, ...chip }) => chip),
    cards: plan.offer.map((card, i) => {
      // Slice 5 (review B1): a departed resident's skill card has no pool form (its skill is granted, no link room).
      const def = card.id === 'skill' ? null : getUpgrade(card.id);
      const tag = def === null ? RESIDENT_UI_TEXT.deck.skillTag : DRAFT_TEXT.form(def.form, def.blocks);
      return { ...card, tag, key: String(i + 1), picked: card.id === plan.pick, fitNote: cardFitNote(state, plan, card.id, ship.name) };
    }),
    pick: plan.pick,
    cardFile: cardFileChip(plan.pick),
    uninvited: uninvitedChip(state, plan),
    noRm: plan.threat.isFinal && noWorkingRm(state) ? THREAT_TEXT.noRmPacket : null,
    trace: packetTraceLine(state, plan),
    room,
    onTheWay: MAP_TEXT.packet.onTheWay(hits, plan.hop.eccFixes, plan.hop.slackYears, hitsLanding(plan.hop, plan.extraHits)),
    deliveries: plan.deliveries.map((chip) => deliveryChipView(chip, ship.name, ship.final)),
    inTransit: inTransitLine(state, plan),
    salvageTitle: REPO_TEXT.packet.salvage,
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

function cardFileChip(pick: DraftCardId | null): CardFileChip | null {
  const [file] = cardFiles(pick, PREVIEW_ID);
  return file === undefined ? null : { name: file.name, blocks: file.size };
}

// Why a delivery chip's SEND ON did not toggle (Track REPO may add reasons).
export type SendOnRefusal = 'no-chip';

// The PACKET's SEND ON on delivery chip `key` (02 §3.9; slice-3b-plan §1.1 item 8): the file stays in the destination's
// receiver to ride the unit's next hop (on a hop into a final ship there is none: it is lost, and the tally lists it), or
// comes back into the packet. One update: the chips re-marked (a first of kind sent on hands "first" to the next chip of
// its kind on this hop, or to none: systems/repository.ts markFirstOfKind, with the seed chances that follow) and the plan's
// filesBlocks / chargeCarried worked out again by planPacket. The card dealt stays (the deal counted the deliveries as first
// packed). The chip's view says `IT IS LOST` on a hop into a final ship (deliveryChipView); the send writes it lost
// (advanceRequests).
export function toggleSendOn(store: Store<GameState>, key: string): SendOnRefusal | null {
  const state = store.getState();
  const plan = requirePlan(state);
  if (!plan.deliveries.some((chip) => chip.key === key)) return 'no-chip';
  const toggled = plan.deliveries.map((chip) => (chip.key === key ? { ...chip, sendOn: !chip.sendOn } : chip));
  const deliveries = markFirstOfKind(state.run, toggled, deliverySeedChance(plan.threat, plan.hop.noise));
  const packet = transitPacket(state, { ...plan, deliveries });
  store.update((draft) => {
    if (!draft.run.transit) throw new Error('toggleSendOn: the transit plan vanished');
    draft.run.transit.deliveries = deliveries;
    draft.run.transit.filesBlocks = packet.filesBlocks;
    draft.run.transit.chargeCarried = packet.chargeCarried;
  });
  return null;
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
  // A skill packed lower and then left behind forgets its PACK AS (slice 4): it crosses at no level.
  const next = withDropped(plan, dropped);
  const packet = transitPacket(state, next);
  store.update((draft) => {
    if (!draft.run.transit) throw new Error('toggleDrop: the transit plan vanished');
    draft.run.transit.dropped = dropped;
    draft.run.transit.packAs = next.packAs;
    draft.run.transit.filesBlocks = packet.filesBlocks;
    draft.run.transit.chargeCarried = packet.chargeCarried;
  });
  return null;
}

// --- Skill chips (slice 4, 03 §3.4; plan §2.6) ----------------------------------------------------------------------------

// The RESTORE the next desk would ask for `id` if it crossed at `level` (null: left behind), against what the run paid.
function restoreAt(state: Readonly<GameState>, id: SkillId, level: Readonly<SkillLevel> | null): number {
  return restoreCostOf(state, id, level);
}

// A skill file of the unit's on the PACKET (not trained at this desk), packed at `packedAs` (null: as it is).
function skillChip(state: Readonly<GameState>, seg: Readonly<SkillFileSegment>, packedAs: Readonly<SkillLevel> | null): SkillChip {
  const nominal: SkillLevel = { version: seg.version, lock: seg.lock };
  const level = packedAs ?? nominal;
  return {
    skill: seg.upgrade, level: { ...level }, nominal, trained: false, packedAs: packedAs === null ? null : { ...packedAs },
    restore: restoreAt(state, seg.upgrade, null), without: PACKET_SKILL_TEXT.without[seg.upgrade],
    packAs: lowerLevels(nominal).map((lower): PackAsOption => {
      const blocks = skillBlocks(seg.upgrade, lower.version, lower.lock);
      const restore = restoreAt(state, seg.upgrade, lower);
      return {
        level: lower, blocks, restore, active: packedAs !== null && packedAs.version === lower.version && packedAs.lock === lower.lock,
        text: PACKET_SKILL_TEXT.packAs(lower.version, blocks, restore),
      };
    }),
  };
}

// The chip's line: `AUTOBURN.skl v2 (9) → brake by hand · RESTORE 5`, at the level it crosses at.
function skillNote(skill: Readonly<SkillChip>): string {
  const def = SKILL_TREE[skill.skill];
  return PACKET_SKILL_TEXT.chip(def.fileName, skill.level.version, skillBlocks(skill.skill, skill.level.version, skill.level.lock),
    skill.without, skill.restore);
}

// The fresh files this desk's training puts in the packet, each a locked chip (`TRAINED HERE · ◀ CHART TO UNDO`, plan §7 R8):
// the files planPacket itself named fresh (packet.skills; review m11: the chips derived the preview ids again).
function trainedChips(state: Readonly<GameState>, packet: Readonly<Packet>): PacketChip[] {
  const packed = [...packet.rackE, ...packet.rackF];
  return packet.skills.filter((entry) => entry.how === 'fresh').map((entry): PacketChip => {
    const file = packed.find((seg) => seg.id === entry.segId);
    if (file === undefined || !isSkillFile(file)) throw new Error(`trainedChips: the fresh ${entry.skill} file ${entry.segId} is not in the packet`);
    const level = held(state, entry.skill) ?? { version: file.version, lock: file.lock };
    return {
      segId: file.id, name: file.name, blocks: file.size, integrity: file.integrity, infected: false, dropped: false, lock: 'trained',
      toggleable: false, note: PACKET_SKILL_TEXT.trainedHere, chargeGain: 0, arriveGain: 0, log: false, glow: false,
      skill: {
        skill: entry.skill, level: { ...level }, nominal: { ...level }, trained: true, packedAs: null, restore: 0,
        without: PACKET_SKILL_TEXT.without[entry.skill], packAs: [],
      },
    };
  });
}
