import type { Hop, RunMapState, RoomFit } from '@/types/map';
import { layoutFor } from '@data/memory';
import { CLASSIC_FIVE } from '@data/classic-five';
import { distTable, layerOf } from '@systems/map-geometry';
import { hopNoise } from '@systems/map-noise';
import { armShipAt, classicHop, classicRoute, worldSlotOf } from '@systems/map-run';
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

// The approach year of the ship in `slot` (classic: its fixture year on the one route).
function approachOf(map: Readonly<RunMapState>, slot: number): number {
  if (map.world === 'classic') return classicRoute(slot, map.startYear).at(-1)!.hop?.approachYear ?? map.startYear;
  return armShipAt(map, slot).approachYear;
}

// The beam from `from` to `to`, whether or not it is reachable (the card shows TOO LATE and OUT OF RANGE hops too).
export function hopBetween(map: Readonly<RunMapState>, from: number, to: number): Hop {
  if (map.world === 'classic') return classicHop(from, to, approachOf(map, from));
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
// The classic world has one route: each ship to the next.
export function reachable(map: Readonly<RunMapState>, from: number, to: number): boolean {
  if (map.world === 'classic') return to === from + 1 && to < CLASSIC_FIVE.length;
  if (from === to || layerOf(worldSlotOf(map, to)) <= layerOf(worldSlotOf(map, from))) return false;
  const hop = hopBetween(map, from, to);
  return hop.inRange && hop.slackYears >= 0;
}

// Every slot reachable from `from`, in slot order.
export function reachableFrom(map: Readonly<RunMapState>, from: number): number[] {
  const slots = map.world === 'classic' ? CLASSIC_FIVE.map((ship) => ship.slot) : map.arm.map((ship) => ship.slot);
  return slots.filter((to) => reachable(map, from, to));
}

// What the unit would carry across: its files (a list, so a delivery's file adds its room with no new type, 3b), the
// REPAIR CHARGE it holds, what arrives with it (the last ship's star credit and the +12 card: systems/carry.ts
// arrivalCharge), and the most blocks the beam's seeds could take (seedBlocksMax: seeds × BEAM_SEED_LAYOUT_BLOCKS).
export interface UnitLoad {
  files: readonly { size: number }[];
  charge: number;
  bonus?: { starCredit: number; card: number };
  seedBlocksMax?: number;
}

// How a unit meets a destination's room (01 §3.16, the spec amendment of 02 §3.3 in slice-3a-plan's review follow-up):
// files plus the charge floor must fit the room (on a TIGHT ship there is no floor: files alone); the link limits files
// plus charge, as phase 2's packUnit does (files over the link itself are the PACKET's link bar's, not counted here).
// The charge that arrives is arrivalCharge's (what crossed, plus the star credit and the card, never below the floor),
// laid out in 01's order: files, the floor, the beam seeds (SEEDS FIRST), the rest. The card's fit line and the
// PACKET's room bar read it:
// • fits: every block that crossed or was earned arrives (seeds aside);
// • squeezed: the room leaves some of it behind (roomLost > 0: `CHARGE SQUEEZED: 15 ARRIVES`, `26 WON'T FIT`);
// • leave: files plus the floor are over the room (`LEAVE 20 BEHIND`): the PACKET waits until files are left;
// • no-charge: no charge arrives at all (only where the floor is 0, a TIGHT ship: `NO CHARGE ARRIVES`), whatever the unit
//   held, an empty unit included.
export function roomFit(unit: Readonly<UnitLoad>, hop: Readonly<Pick<Hop, 'linkBlocks' | 'room' | 'chargeFloor'>>): RoomFit {
  const whole = (n: number, what: string): number => {
    if (!(Number.isInteger(n) && n >= 0)) throw new Error(`roomFit: ${what} ${n}`);
    return n;
  };
  const charge = whole(unit.charge, 'charge');
  const bonus = whole(unit.bonus?.starCredit ?? 0, 'star credit') + whole(unit.bonus?.card ?? 0, 'card charge');
  const seedsMax = whole(unit.seedBlocksMax ?? 0, 'seed blocks');
  const files = unit.files.reduce((sum, file) => sum + file.size, 0);
  const floor = hop.chargeFloor;
  const room = hop.room;
  const over = Math.max(0, files + floor - room);
  const carried = Math.max(0, Math.min(charge, hop.linkBlocks - files));
  const wanted = Math.max(floor, carried + bonus);
  const avail = room - files;
  const arrive = (seedBlocks: number): number => {
    if (over > 0) return 0;
    const floorHeld = Math.min(wanted, floor);
    const seeds = Math.min(seedBlocks, avail - floorHeld);
    return Math.min(wanted, avail - seeds);
  };
  const chargeArrives = arrive(0);
  const chargeArrivesMin = arrive(seedsMax);
  const linkLost = charge - carried;
  const roomLost = over > 0 ? 0 : wanted - chargeArrives;
  let word: RoomFit['word'];
  if (over > 0) word = 'leave';
  else if (chargeArrives === 0) word = 'no-charge';
  else if (roomLost > 0) word = 'squeezed';
  else word = 'fits';
  return { files, room, floor, carried, wanted, chargeArrives, chargeArrivesMin, linkLost, roomLost, over, word };
}
