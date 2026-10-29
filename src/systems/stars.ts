import type { GameState } from '@state/schema';
import { onTargetTally } from '@systems/landing-rules';
import { shownFuelPct } from '@systems/flight-hud';
import { LANDING_STAR_TEXT, LANDING_STAR_MISSED } from '@data/landing-text';
import { STAR_CHARGE_BONUS, STAR_FUEL_PCT } from '@data/tuning';

// A ship's three stars (01-landing §3.9), pure and DOM-free:
// • ★ ORBIT LOCKED: the flight ended in ORBIT LOCK (an ACCEPT ORBIT is not a lock);
// • ★ ON TARGET: at least STAR_ON_TARGET_FRAC of the colonists aboard landed soft in an LZ with room (the denominator
//   counts the pods that never launched: landing-rules onTargetTally);
// • ★ FUEL: FUEL at least STAR_FUEL_PCT at the END OF THE LANDING (landing.fuelAtEndPct, so FUEL spent on 1b's decay
//   counts), judged on the number the FUEL bar shows, and only after a lock.
// Each star is +STAR_CHARGE_BONUS REPAIR CHARGE on the next ship. A missed star carries the reason a kid can act on.

export type StarId = 'locked' | 'on-target' | 'fuel';

export interface ShipStar {
  id: StarId;
  earned: boolean;
  label: string;          // ORBIT LOCKED, ON TARGET 5/6, FUEL 34%
  reason: string | null;  // why it was missed; null when earned
}

// The stars as the LANDING REPORT judges them. Before the landing has ended the FUEL star reads the tank as it is now.
export function shipStars(state: Readonly<GameState>): ShipStar[] {
  const locked = state.burn.status === 'locked';
  const tally = onTargetTally(state);
  const fuel = shownFuelPct(state.landing.fuelAtEndPct ?? state.burn.fuelPct);
  const fuelEarned = locked && fuel >= STAR_FUEL_PCT;
  return [
    { id: 'locked', earned: locked, label: LANDING_STAR_TEXT.locked, reason: locked ? null : LANDING_STAR_MISSED.accepted },
    {
      id: 'on-target', earned: tally.earned, label: LANDING_STAR_TEXT.onTarget(tally.onTargetPods, tally.pods),
      reason: tally.earned ? null : LANDING_STAR_MISSED.onTarget(tally.colonists - tally.onTargetColonists),
    },
    {
      id: 'fuel', earned: fuelEarned, label: LANDING_STAR_TEXT.fuel(fuel),
      reason: fuelEarned ? null : locked ? LANDING_STAR_MISSED.fuelLow(fuel, STAR_FUEL_PCT) : LANDING_STAR_MISSED.fuelNoLock,
    },
  ];
}

// The REPAIR CHARGE the stars carry to the next ship (§4.4: +6 per star).
export function starCharge(stars: readonly ShipStar[]): number {
  return stars.filter((star) => star.earned).length * STAR_CHARGE_BONUS;
}
