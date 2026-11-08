import type { RunMapState } from '@/types/map';
import type { RunThreatState } from '@/types/threat';
import type { ShipThreatFacts } from '@systems/threat-plan';
import { END_SLOTS } from '@data/arm';
import { hopBetween, reachable } from '@systems/map-hop';
import { isEndSlot } from '@systems/map-streams';
import { fixedShipFacts, createRunThreat, applyThreat, planThreat, threatInputFor, NO_FINAL_TRACES } from '@systems/threat-plan';
import { SEEDS_MIN_DEPTH } from '@data/tuning';

// What the map tells the threat ladder about the beam into a ship (slice-3a-plan §2.6; 04 §3.4, §3.8; 02 §3.6): its
// depth, whether it is a final ship, whether a final ship is one hop from it (M3: HOLLOW's forced boarding) and what the
// beam into it carries. Replaces phase 2's fixed facts on the arm; the classic world keeps CLASSIC_FACTS
// (systems/threat-plan.ts fixedShipFacts). Pure. Track GEN owns this file after the foundation.

// M3 (02 §3.6, 04 §3.8): a final ship is reachable from `slot` (the final year is set so range implies time).
export function oneHopFromFinal(map: Readonly<RunMapState>, slot: number): boolean {
  if (map.world === 'classic') return fixedShipFacts(slot).oneHopFromFinal;
  return END_SLOTS.some((end) => end !== slot && reachable(map, slot, end));
}

// The facts of the beam from `from` into `to`, the ship at `depth` on the route. At SEEDS_MIN_DEPTH the source is the
// scripted one (rollBeamSeeds plays its first-run pick only on the tutorial run, so run 1's RM lesson is next to Telemetry
// whatever the noise; later runs roll the hop's noise); deeper, the hop's noise. beamSourceOf (systems/run.ts) already
// keeps seeds out of calm ships.
export function mapFacts(map: Readonly<RunMapState>, from: number, to: number, depth: number): ShipThreatFacts {
  if (map.world === 'classic') {
    const facts = fixedShipFacts(to);
    if (facts.depth !== depth) throw new Error(`mapFacts: classic ship ${to} is depth ${facts.depth}, not ${depth}`);
    return facts;
  }
  const hop = hopBetween(map, from, to);
  return {
    depth,
    isFinal: isEndSlot(map, to),
    oneHopFromFinal: oneHopFromFinal(map, to),
    beamSeeds: depth === SEEDS_MIN_DEPTH
      ? { kind: 'scripted', firstRun: [{ role: 'telemetry' }], later: hop.noise }
      : { kind: 'noise', noise: hop.noise },
  };
}

// The run's threat at the end of a route (slots, first ship first) flown with TRACE 0 and no DEAL (slice-2-plan risk 14):
// the fixtures' and __ap.route's starting point; the classic world's nominalRunThreat is this on its one route.
export function nominalRouteThreat(map: Readonly<RunMapState>, slots: readonly number[]): RunThreatState {
  if (slots.length === 0) throw new Error('nominalRouteThreat: an empty route');
  let threat = createRunThreat();
  slots.forEach((slot, index) => {
    const facts = index === 0
      ? { depth: 1, isFinal: false, oneHopFromFinal: false, beamSeeds: { kind: 'none' as const } }
      : mapFacts(map, slots[index - 1]!, slot, index + 1);
    threat = applyThreat(threat, planThreat(threatInputFor(threat, facts, false, NO_FINAL_TRACES)));
  });
  return threat;
}
