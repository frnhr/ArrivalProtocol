import type { GameState } from '@state/schema';
import type { Hop, RoomFit } from '@/types/map';
import type { ShipThreat } from '@/types/threat';
import type { UpgradeId } from '@data/upgrades';
import type { DeliveryChip } from '@/types/repo';
import { packedFiles, BEAM_SEED_LAYOUT_BLOCKS } from '@systems/carry';
import { planPacket, pickCharge } from '@systems/draft';
import { roomFit, linkBlocksFor } from '@systems/map-hop';
import { FRESH_UNIT_RACK_E, layoutFor } from '@data/memory';
import { FS_TOOL_KINDS, createToolFiles } from '@data/fs-tools';
import { LOG_FILE } from '@data/log-text';
import { BEAM_RANGE_LY } from '@data/tuning';
import { seedAllowance } from '@systems/map-noise';
import { playsTutorial } from '@systems/meta';
import { MAP_TEXT } from '@data/map-text';
import { TRANSMIT_TEXT, arrivalParts } from '@data/script';

// What arrives with the unit (phase 3 slice 3a, the review's M1, M2, m1, m2 and m6): ONE preview, from one roomFit, drives
// every arrival number the kid reads before the beam, on the SHIP CARD (its fit line), the PACKET (the arrival line, the
// room line under the room bar, `n TOO MANY …`) and the inline confirm; systems/run.ts transmitNext asserts the layout
// agrees with it for the seeds the beam really rolled. Before it, three places built their own (the card, the PACKET's
// room bar, its arrival line) and LAPWING's PACKET read `CHARGE 54 → 20 ON ARRIVAL` over `= 54 REPAIR CHARGE`.
// • unitArrival: the unit as it would cross to a hop (its packet with the drops and the pick, the charge it holds, the star
//   credit and the card's charge), with the room the beam's seeds may take by the ladder's verdict (map-noise.ts
//   seedAllowance: none into a calm ship; the tutorial's scripted seed exactly; else the noise's 0 up to its most);
// • arrivalPreview: the words, from the fit alone.

// What the arrival line adds up besides the charge that crosses.
export interface ArrivalCredit {
  starCredit: number;
  stars: number;
  card: number;
}

export interface ArrivalPreview {
  fit: RoomFit;
  sum: string;                  // ON ARRIVAL: 36 CARRIED + 18 (★★★) = 54 REPAIR CHARGE, or … = 54 · ROOM FOR 20
  card: string;                 // the SHIP CARD's fit line: YOU FIT, CHARGE SQUEEZED: 20 ARRIVES (6 IF SEEDS RIDE) …
  charge: string | null;        // the PACKET's line under the room bar (null: everything fits, seeds or not)
  tooMany: string | null;       // n TOO MANY FOR THE LINK / ROOM · LEAVE FILES BEHIND: TRANSMIT ▸ waits
  tone: 'quiet' | 'squeezed' | 'zero' | 'over';
  confirm: string | null;       // the inline confirm's question: the charge may arrive at 0 (M2: seeds included)
}

export function arrivalPreview(fit: Readonly<RoomFit>, credit: Readonly<ArrivalCredit>): ArrivalPreview {
  const card = MAP_TEXT.card.fit(fit);
  if (fit.word === 'leave') {
    const tooMany = fit.overLink >= fit.over ? MAP_TEXT.packet.overLink(fit.overLink) : MAP_TEXT.packet.overRoom(fit.over);
    return { fit: { ...fit }, sum: MAP_TEXT.packet.arrivalLeave, card, charge: null, tooMany, tone: 'over', confirm: null };
  }
  const parts = arrivalParts(fit.carried, credit.starCredit, credit.stars, fit.floorAdded, credit.card);
  if (fit.carried + credit.starCredit + credit.card + fit.floorAdded !== fit.wanted) {
    throw new Error(`arrivalPreview: the parts sum to ${fit.carried + credit.starCredit + credit.card + fit.floorAdded}, the fit wants ${fit.wanted}`);
  }
  const sum = fit.roomLost > 0 || fit.chargeArrives < fit.wanted
    ? MAP_TEXT.packet.roomFor(parts, fit.wanted, fit.chargeArrives)
    : TRANSMIT_TEXT.arrival(fit.carried, credit.starCredit, credit.stars, fit.floorAdded, fit.wanted, credit.card);
  const seedsBite = fit.chargeArrivesMin < fit.chargeArrives;
  let charge: string | null = null;
  if (fit.roomLost > 0) {
    charge = fit.chargeArrives === 0 && fit.wanted === 0 ? MAP_TEXT.packet.zeroCharge
      : seedsBite ? MAP_TEXT.packet.squeezeSeeds(fit.wanted, fit.chargeArrives, fit.chargeArrivesMin, fit.roomLost)
        : MAP_TEXT.packet.squeeze(fit.wanted, fit.chargeArrives, fit.roomLost);
  } else if (fit.chargeArrives === 0) {
    charge = MAP_TEXT.packet.zeroCharge;
  } else if (seedsBite) {
    charge = MAP_TEXT.packet.seedsMay(fit.chargeArrives, fit.chargeArrivesMin);
  }
  const zero = fit.chargeArrivesMin === 0;
  const confirm = !zero ? null : fit.chargeArrives === 0 ? MAP_TEXT.packet.zeroConfirm : MAP_TEXT.packet.zeroIfSeedsConfirm;
  const tone: ArrivalPreview['tone'] = zero ? 'zero' : charge !== null ? 'squeezed' : 'quiet';
  return { fit: { ...fit }, sum, card, charge, tooMany: null, tone, confirm };
}

// What a crossing to `hop` is planned with: the ladder's verdict for the destination (its seeds), the files left behind,
// the card picked and the deliveries riding the hop (phase 3 slice 3b: TransitPlan.deliveries; the card: the hop's
// deliveriesForHop, none dropped or picked yet).
export interface ArrivalPlan {
  hop: Readonly<Pick<Hop, 'linkBlocks' | 'room' | 'chargeFloor'>>;
  threat: Readonly<Pick<ShipThreat, 'act' | 'beamSeeds'>>;
  dropped: readonly string[];
  pick: UpgradeId | null;
  deliveries: readonly DeliveryChip[];
}

// The unit's arrival over `plan`. `seedsExact`: the seeds the beam really rolled (transmitNext's check), in place of the
// verdict's allowance.
export function unitArrival(state: Readonly<GameState>, plan: Readonly<ArrivalPlan>, seedsExact?: number): ArrivalPreview {
  const packet = planPacket(state.memory, { linkBlocks: plan.hop.linkBlocks, dropped: plan.dropped, pick: plan.pick, deliveries: plan.deliveries });
  const seeds = seedsExact !== undefined
    ? { min: seedsExact, max: seedsExact }
    : seedAllowance(plan.threat, playsTutorial(state.run)) ?? { min: 0, max: 0 };
  const card = pickCharge(plan.pick);
  const fit = roomFit({
    files: packedFiles(packet).map((seg) => ({ size: seg.size })),
    charge: packet.chargeHeld,
    bonus: { starCredit: state.run.pendingStarCredit, card },
    seedBlocksMin: seeds.min * BEAM_SEED_LAYOUT_BLOCKS,
    seedBlocksMax: seeds.max * BEAM_SEED_LAYOUT_BLOCKS,
  }, plan.hop);
  return arrivalPreview(fit, { starCredit: state.run.pendingStarCredit, stars: state.run.pendingStars, card });
}

// At load (the review's B1): the files the PACKET can never leave behind (systems/carry.ts dropLock: the Core, Engine
// I/O, Nav Plotter, 046.log and one copy of every filesystem tool, at their biggest) fit the shortest beam's link
// (BEAM_RANGE_LY) and a TIGHT ship's room, so `LEAVE FILES BEHIND` always has an answer: there is always enough to drop.
(function checkLockedFilesFit(): void {
  const locked = FRESH_UNIT_RACK_E.filter((item): item is Exclude<typeof item, { free: number }> => !('free' in item))
    .filter((item) => item.role === 'core' || item.role === 'engine-io' || item.role === 'navplot')
    .reduce((sum, item) => sum + item.size, LOG_FILE.size)
    + FS_TOOL_KINDS.reduce((sum, kind) => sum + Math.max(...createToolFiles(kind).map((file) => file.size)), 0);
  const shortest = linkBlocksFor(BEAM_RANGE_LY);
  const tight = layoutFor('TIGHT').roomForUnit;
  if (locked > shortest || locked > tight) {
    throw new Error(`arrival-preview: ${locked} blocks of locked files, over the shortest link (${shortest}) or TIGHT's room (${tight})`);
  }
})();
