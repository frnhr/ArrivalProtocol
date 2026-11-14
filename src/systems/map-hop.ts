import type { Hop, RunMapState, RoomFit } from '@/types/map';
import { layoutFor, fillRoom, BEAM_SEED_LAYOUT_BLOCKS } from '@data/memory';
import { distTable, beamReaches } from '@systems/map-geometry';
import { hopNoise } from '@systems/map-noise';
import { armShipAt, worldSlotOf } from '@systems/map-run';
import {
  BEAM_RANGE_LY, LINK_BASE_TENTHS, LINK_PER_LY_TENTHS, TRANSIT_LY_PER_HIT, ECC_YEARS_PER_HIT,
} from '@data/tuning';

// One beam between two slots (02-map §3.1, §3.3; slice-3a-plan §2.1, §2.3), pure and real from the foundation on (both
// tracks need true numbers). Integer arithmetic with half-up rounding everywhere: distances are whole LY, years whole
// years, and every round() is Math.round on a positive number (slice-3a-plan §2.3: LAST LIGHT's 3020 needs it).
// Track GEN owns this file after the foundation.

// The link's bandwidth over d LY: round(146 − 1.1·d), as round((1460 − 11·d) / 10) so no float creeps in. 21 LY gives
// 123, 25 LY 119, 45 LY 97 (the sim's half-even gives 118 and 96).
export function linkBlocksFor(distanceLy: number): number {
  if (!(Number.isInteger(distanceLy) && distanceLy > 0)) throw new Error(`linkBlocksFor: ${distanceLy} LY is not a whole positive distance`);
  return Math.round((LINK_BASE_TENTHS - LINK_PER_LY_TENTHS * distanceLy) / 10);
}

// Seeded transit hits over d LY: round(d / 7).
export function transitHitsFor(distanceLy: number): number {
  if (!(Number.isInteger(distanceLy) && distanceLy > 0)) throw new Error(`transitHitsFor: ${distanceLy} LY is not a whole positive distance`);
  return Math.round(distanceLy / TRANSIT_LY_PER_HIT);
}

// Hits ECC repairs while the unit sleeps through `slackYears`: one per 25 years (none on a late hop).
export function eccFixesFor(slackYears: number): number {
  return slackYears > 0 ? Math.floor(slackYears / ECC_YEARS_PER_HIT) : 0;
}

// The hits that land at the boot (02 §3.3's one formula): round(d / 7) plus the BEAM OUT or EMERGENCY extras, minus ECC,
// never below 0.
export function hitsLanding(hop: Readonly<Pick<Hop, 'transitHits' | 'eccFixes'>>, extraHits: number): number {
  if (!(Number.isInteger(extraHits) && extraHits >= 0)) throw new Error(`hitsLanding: extra hits ${extraHits}`);
  return Math.max(0, hop.transitHits + extraHits - hop.eccFixes);
}

// The approach year of the ship in `slot`.
function approachOf(map: Readonly<RunMapState>, slot: number): number {
  return armShipAt(map, slot).approachYear;
}

// The beam from `from` to `to`, whether or not it is reachable (the card shows TOO LATE and OUT OF RANGE hops too).
export function hopBetween(map: Readonly<RunMapState>, from: number, to: number): Hop {
  if (from === to) throw new Error(`hopBetween: slot ${from} to itself`);
  const dest = armShipAt(map, to);
  const distanceLy = distTable(worldSlotOf(map, from), worldSlotOf(map, to));
  const leaveYear = approachOf(map, from);
  const arriveYear = leaveYear + distanceLy;
  const slackYears = dest.approachYear - arriveYear;
  const layout = layoutFor(dest.memoryClass);
  return {
    from, to, distanceLy,
    linkBlocks: linkBlocksFor(distanceLy),
    transitHits: transitHitsFor(distanceLy),
    eccFixes: eccFixesFor(slackYears),
    leaveYear, arriveYear, approachYear: dest.approachYear, slackYears,
    noise: hopNoise(map.noise, worldSlotOf(map, from), worldSlotOf(map, to)),
    inRange: distanceLy <= BEAM_RANGE_LY,
    memoryClass: layout.cls, room: layout.roomForUnit, chargeFloor: layout.chargeFloor,
  };
}

// Can the unit beam from `from` to `to` (02 §3.1)? Outward (a higher layer), within BEAM_RANGE_LY, and in time (slack ≥ 0).
export function reachable(map: Readonly<RunMapState>, from: number, to: number): boolean {
  if (from === to) return false;
  return beamReaches(worldSlotOf(map, from), worldSlotOf(map, to), approachOf(map, from), armShipAt(map, to).approachYear);
}

// Every slot reachable from `from`, in slot order.
export function reachableFrom(map: Readonly<RunMapState>, from: number): number[] {
  return map.arm.map((ship) => ship.slot).filter((to) => reachable(map, from, to));
}

// What the unit would carry across: its files (a list, so a delivery's file adds its room with no new type, 3b), the
// REPAIR CHARGE it holds, what arrives with it (the last ship's star credit and the +12 card: systems/carry.ts
// arrivalCharge), and the blocks the beam's seeds could take, fewest and most (seeds × BEAM_SEED_LAYOUT_BLOCKS: the
// tutorial's scripted seed is always 1, a noisy hop's 0 up to its odds' most; systems/map-noise.ts seedAllowance).
export interface UnitLoad {
  files: readonly { size: number }[];
  charge: number;
  // Slice 7c: `gift`, a trace's charge on arrival (systems/trace-gifts.ts traceGiftCharge; left out: none).
  bonus?: { starCredit: number; card: number; gift?: number };
  seedBlocksMin?: number;
  seedBlocksMax?: number;
}

// How a unit meets a destination's link and room (01 §3.16, the spec amendment of 02 §3.3 in slice-3a-plan's review
// follow-up): files must cross the link (the review's B1: files over it are `leave`, not a throw at SET COURSE); files
// plus the charge floor must fit the room (on a TIGHT ship there is no floor: files alone); the link limits files plus
// charge, as phase 2's packUnit does. The charge that arrives is arrivalCharge's (what crossed, plus the star credit,
// never below the floor, then the card on top: playtest 1 Q19), laid out by data/memory.ts fillRoom, the rule
// layoutCarried lays the unit out by:
// • fits: every block that crossed or was earned arrives (with the fewest seeds);
// • squeezed: the room leaves some of it behind (roomLost > 0: `CHARGE SQUEEZED: 15 ARRIVES`, `26 WON'T FIT`);
// • leave: files are over the link, or files plus the floor over the room: the PACKET waits until files are left;
// • no-charge: no charge arrives at all (only where the floor is 0, a TIGHT ship: `NO CHARGE ARRIVES`), whatever the unit
//   held, an empty unit included.
// The words are systems/arrival-preview.ts's, from this one result, everywhere.
export function roomFit(unit: Readonly<UnitLoad>, hop: Readonly<Pick<Hop, 'linkBlocks' | 'room' | 'chargeFloor'>>): RoomFit {
  const whole = (n: number, what: string): number => {
    if (!(Number.isInteger(n) && n >= 0)) throw new Error(`roomFit: ${what} ${n}`);
    return n;
  };
  const seeds = (blocks: number, what: string): number => {
    if (whole(blocks, what) % BEAM_SEED_LAYOUT_BLOCKS !== 0) throw new Error(`roomFit: ${what} ${blocks} is not whole seeds`);
    return blocks / BEAM_SEED_LAYOUT_BLOCKS;
  };
  const charge = whole(unit.charge, 'charge');
  const card = whole(unit.bonus?.card ?? 0, 'card charge');
  const bonus = whole(unit.bonus?.starCredit ?? 0, 'star credit') + card + whole(unit.bonus?.gift ?? 0, 'gift charge');
  const seedsMin = seeds(unit.seedBlocksMin ?? 0, 'seed blocks (fewest)');
  const seedsMax = seeds(unit.seedBlocksMax ?? 0, 'seed blocks (most)');
  if (seedsMin > seedsMax) throw new Error(`roomFit: ${seedsMin} seeds at the fewest, ${seedsMax} at the most`);
  const files = unit.files.reduce((sum, file) => sum + file.size, 0);
  const link = hop.linkBlocks;
  const floor = hop.chargeFloor;
  const room = hop.room;
  const over = Math.max(0, files + floor - room);
  const overLink = Math.max(0, files - link);
  const leave = over > 0 || overLink > 0;
  const carried = Math.max(0, Math.min(charge, link - files));
  // Playtest 1 (Q19): the card counts after the floor, as carry.ts arrivalCharge (the floor tops up the rest, never the card).
  const floored = Math.max(floor, carried + bonus - card);
  const wanted = floored + card;
  const arrive = (count: number): number => (leave ? 0 : fillRoom(room, files, floor, wanted, count).charge);
  const chargeArrives = arrive(seedsMin);
  const chargeArrivesMin = arrive(seedsMax);
  const linkLost = charge - carried;
  const roomLost = leave ? 0 : wanted - chargeArrives;
  let word: RoomFit['word'];
  if (leave) word = 'leave';
  else if (chargeArrives === 0) word = 'no-charge';
  else if (roomLost > 0) word = 'squeezed';
  else word = 'fits';
  return {
    files, link, room, floor, carried, bonus, wanted, floorAdded: wanted - (carried + bonus), seedsMin, seedsMax,
    chargeArrives, chargeArrivesMin, linkLost, roomLost, over, overLink, word,
  };
}

// The part of a card's `card` blocks of charge (inside `fit`'s bonus) that the room takes, with the fewest seeds (playtest 1
// Q19): the PACKET's `+12` segment on the room bar and the card's `ONLY 4 FIT ON HALCYON`. The card counts after the floor,
// so this is what the room adds for it: the charge that arrives, less what would arrive without it.
export function cardArrives(fit: Readonly<RoomFit>, card: number): number {
  if (!(Number.isInteger(card) && card >= 0 && card <= fit.bonus)) throw new Error(`cardArrives: card ${card} of a bonus of ${fit.bonus}`);
  if (fit.word === 'leave') return 0;
  const without = fillRoom(fit.room, fit.files, fit.floor, fit.wanted - card, fit.seedsMin).charge;
  return fit.chargeArrives - without;
}
