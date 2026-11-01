import type { Hop, RunMapState, RoomFit } from '@/types/map';
import { layoutFor } from '@data/memory';
import { CLASSIC_FIVE } from '@data/classic-five';
import { distTable, layerOf } from '@systems/map-geometry';
import { hopNoise } from '@systems/map-noise';
import { armShipAt, classicHop, classicRoute } from '@systems/map-run';
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
  const distanceLy = distTable(from, to);
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
    noise: hopNoise(map.noise, from, to),
    memoryClass: layout.cls, room: layout.roomForUnit, chargeFloor: layout.chargeFloor,
  };
}

// Can the unit beam from `from` to `to` (02 §3.1)? Outward (a higher layer), within BEAM_RANGE_LY, and in time (slack ≥ 0).
// The classic world has one route: each ship to the next.
export function reachable(map: Readonly<RunMapState>, from: number, to: number): boolean {
  if (map.world === 'classic') return to === from + 1 && to < CLASSIC_FIVE.length;
  if (from === to || layerOf(to) <= layerOf(from)) return false;
  const hop = hopBetween(map, from, to);
  return hop.distanceLy <= BEAM_RANGE_LY && hop.slackYears >= 0;
}

// Every slot reachable from `from`, in slot order.
export function reachableFrom(map: Readonly<RunMapState>, from: number): number[] {
  const slots = map.world === 'classic' ? CLASSIC_FIVE.map((ship) => ship.slot) : map.arm.map((ship) => ship.slot);
  return slots.filter((to) => reachable(map, from, to));
}

// What the unit would carry across: its files (a list, so a delivery's file adds its room with no new type, 3b) and the
// REPAIR CHARGE it holds.
export interface UnitLoad {
  files: readonly { size: number }[];
  charge: number;
}

// How a unit meets a destination's room (01 §3.16, 02 §3.3): files plus the charge floor must fit the room (on a TIGHT
// ship there is no floor: files alone); the charge that crosses is what the link leaves after the files (packUnit's
// rule), and it lands up to what the room leaves, never below the floor (ARRIVAL CONTROL's top-up arrives whatever
// crossed). Files over the link itself are the PACKET's link bar's (phase 2), not counted here. The card's fit line and
// the PACKET's room bar read it:
// • fits: every block of charge arrives;
// • squeezed: some charge does not fit (`CHARGE SQUEEZED: 15 ARRIVES`, `26 WON'T FIT`);
// • leave: files plus the floor are over (`LEAVE 20 BEHIND`): the PACKET waits until files are left;
// • no-charge: nothing of the charge arrives (only on a TIGHT ship, whose floor is 0: `NO CHARGE ARRIVES`).
export function roomFit(unit: Readonly<UnitLoad>, hop: Readonly<Pick<Hop, 'linkBlocks' | 'room' | 'chargeFloor'>>): RoomFit {
  if (!(Number.isInteger(unit.charge) && unit.charge >= 0)) throw new Error(`roomFit: charge ${unit.charge}`);
  const files = unit.files.reduce((sum, file) => sum + file.size, 0);
  const floor = hop.chargeFloor;
  const room = hop.room;
  const over = Math.max(0, files + floor - room);
  const carried = Math.max(0, Math.min(unit.charge, hop.linkBlocks - files));
  const chargeArrives = over > 0 ? 0 : Math.min(Math.max(carried, floor), room - files);
  const chargeLost = Math.max(0, unit.charge - chargeArrives);
  let word: RoomFit['word'];
  if (over > 0) word = 'leave';
  else if (chargeArrives === 0 && unit.charge > 0) word = 'no-charge';
  else if (chargeLost > 0) word = 'squeezed';
  else word = 'fits';
  return { files, room, floor, chargeArrives, chargeLost, over, word };
}
