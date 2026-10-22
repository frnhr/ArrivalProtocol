import type { GameState, ClusterResult } from '@state/schema';
import { soulsInMemory, soulOutcome } from '@state/selectors';
import { shownFuelPct } from '@systems/flight-hud';
import { STAR_TEXT, STAR_MISSED } from '@data/script';
import { STAR_INTACT_FRAC, STAR_CHARGE_BONUS, STAR_FUEL_PCT, SOUL_WAKE_INTACT_MIN } from '@data/tuning';

// A ship's three stars (§4.4), pure and DOM-free:
// • ★ ORBIT LOCKED: the flight ended in ORBIT LOCK (an ACCEPT ORBIT is not a lock);
// • ★ INTACT: at least STAR_INTACT_FRAC of the ship's souls woke intact;
// • ★ FUEL: FUEL at the lock at least STAR_FUEL_PCT, judged on the number the FUEL bar shows (the
//   EngineWindow's ★ notch, "Lock the orbit with at least 20% FUEL left"), so no lock, no FUEL ★.
// Each star is +STAR_CHARGE_BONUS REPAIR CHARGE on the next ship. A missed star carries the reason a
// kid can act on next time. The MiniHud reads intactTally live while printing (`★ INTACT 11/12`).
// FUEL is read from the ship as it is: once the orbit is locked nothing burns any more (the sim only
// coasts while printing), so the FUEL now is the FUEL at the lock.

export type StarId = 'locked' | 'intact' | 'fuel';

export interface ShipStar {
  id: StarId;
  earned: boolean;
  label: string;          // ORBIT LOCKED, INTACT 11/12, FUEL 34%
  reason: string | null;  // why it was missed; null when earned
}

// The clusters (and souls) that woke intact, or would if they printed now (in memory, not being
// eaten, at or above SOUL_WAKE_INTACT_MIN), out of all this ship arrived with. Live while printing;
// final in the WAKE REPORT, when every cluster has left memory.
export interface IntactTally {
  intact: number;       // clusters
  clusters: number;
  intactSouls: number;
  souls: number;
  onTrack: boolean;     // the INTACT ★ is earned (or still would be)
  // It can still be earned: repairing every hurt cluster still in memory would be enough. False once
  // too many have already woken with gaps (the MiniHud's ★ goes hollow).
  possible: boolean;
  // The clusters still in memory that would not wake intact now, in address order: what to repair.
  hurt: string[];
}

export function intactTally(state: Readonly<GameState>): IntactTally {
  let intact = 0;
  let clusters = 0;
  let intactSouls = 0;
  let souls = 0;
  let savable = 0;  // souls that woke intact, or are still in memory (a repair could save them)
  const hurt: string[] = [];
  for (const result of state.souls.results) {
    clusters++;
    souls += result.souls;
    if (result.outcome === 'woke') { intact++; intactSouls += result.souls; savable += result.souls; }
  }
  for (const soul of soulsInMemory(state)) {
    clusters++;
    souls += soul.souls;
    savable += soul.souls;
    if (!soul.infected && soulOutcome(soul.integrity) === 'woke') { intact++; intactSouls += soul.souls; }
    else hurt.push(soul.cluster);
  }
  const needed = STAR_INTACT_FRAC * souls;
  return {
    intact, clusters, intactSouls, souls, hurt,
    onTrack: souls > 0 && intactSouls >= needed,
    possible: souls > 0 && savable >= needed,
  };
}

// The MiniHud's line while printing (§9 WP5 item 9): `★ INTACT 11/12`. The tone says what the kid
// can still do: 'good' on track; 'risk' when a hurt cluster still in memory would cost the star (a
// repair before it prints saves it), which the line then names (`· REPAIR C09`: the gold and the
// hurt yellow are too close to tell apart on their own); 'lost' once it cannot be earned any more
// (a hollow ☆).
export type IntactTone = 'good' | 'risk' | 'lost';

export function intactHudLine(tally: IntactTally): { text: string; tone: IntactTone } {
  const tone: IntactTone = tally.onTrack ? 'good' : tally.possible ? 'risk' : 'lost';
  const line = `${tone === 'lost' ? '☆' : '★'} ${STAR_TEXT.intact(tally.intact, tally.clusters)}`;
  const fix = tone === 'risk' ? tally.hurt[0] : undefined;
  return { text: fix === undefined ? line : line + STAR_TEXT.repairNext(fix), tone };
}

// Why the INTACT ★ was missed, naming the fix that would have saved the most: a cluster that did
// not wake first (the worst); else whichever cost more clusters, a hurt print (repair it) or the
// low-range roll (lock the orbit). A low-range accept with C09 unrepaired is mostly the range's
// fault: telling that kid to repair would teach the wrong lesson.
function intactMissedReason(results: readonly ClusterResult[]): string {
  const missed = results.filter((result) => result.outcome !== 'woke');
  if (missed.length === 0) throw new Error('intactMissedReason: the INTACT ★ was missed with every cluster intact');
  const more = (count: number): string => (count > 0 ? STAR_MISSED.more(count) : '');
  const lost = missed.find((result) => result.outcome === 'lost');
  if (lost) return STAR_MISSED.lost(lost.cluster, lost.family) + more(missed.length - 1);
  const hurt = missed.filter((result) => result.integrity < SOUL_WAKE_INTACT_MIN).sort((a, b) => a.integrity - b.integrity);
  const rolled = missed.filter((result) => result.integrity >= SOUL_WAKE_INTACT_MIN).sort((a, b) => a.range - b.range);
  const worstHurt = hurt[0];
  const worstRolled = rolled[0];
  if (worstRolled && rolled.length > hurt.length) {
    // Rounded, not floored like the live readouts: the orbit's range drifts in the fourth decimal
    // while the ship coasts, and 0.29999 must still read as the 30% the kid accepted.
    const rangePct = Math.round(worstRolled.range * 100);
    const reason = rolled.length === 1
      ? STAR_MISSED.range(worstRolled.cluster, worstRolled.family, rangePct)
      : STAR_MISSED.rangeMany(rolled.length, rangePct);
    return worstHurt ? reason + STAR_MISSED.alsoHurt(worstHurt.cluster, Math.floor(worstHurt.integrity)) + more(hurt.length - 1) : reason;
  }
  if (!worstHurt) throw new Error('intactMissedReason: a missed cluster that is neither hurt, rolled nor lost');
  return STAR_MISSED.hurt(worstHurt.cluster, worstHurt.family, Math.floor(worstHurt.integrity)) + more(missed.length - 1);
}

// The stars as the WAKE REPORT judges them, once printing is done.
export function shipStars(state: Readonly<GameState>): ShipStar[] {
  if (soulsInMemory(state).length > 0) throw new Error('shipStars: clusters are still in memory (the ship is not done)');
  const locked = state.burn.status === 'locked';
  const tally = intactTally(state);
  const fuel = shownFuelPct(state.burn.fuelPct);
  const fuelEarned = locked && fuel >= STAR_FUEL_PCT;
  return [
    { id: 'locked', earned: locked, label: STAR_TEXT.locked, reason: locked ? null : STAR_MISSED.accepted },
    {
      id: 'intact', earned: tally.onTrack, label: STAR_TEXT.intact(tally.intact, tally.clusters),
      reason: tally.onTrack ? null : intactMissedReason(state.souls.results),
    },
    {
      id: 'fuel', earned: fuelEarned, label: STAR_TEXT.fuel(fuel),
      reason: fuelEarned ? null : locked ? STAR_MISSED.fuelLow(fuel) : STAR_MISSED.fuelNoLock,
    },
  ];
}

// The REPAIR CHARGE the stars carry to the next ship (§4.4: +6 per star).
export function starCharge(stars: readonly ShipStar[]): number {
  return stars.filter((star) => star.earned).length * STAR_CHARGE_BONUS;
}
