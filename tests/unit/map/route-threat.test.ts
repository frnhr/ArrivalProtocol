// Track GEN: the threat ladder on the map's facts (slice-3a-plan §2.6; 04-threats §3.4, §3.8, §3.16): 04 §3.16's routes
// A (5 ships, noisy), B (8 ships, clean and careful) and C (8 ships, noisy and sloppy) on real run-1 routes; M3 on run 1
// (CORMORANT true, VESPER false); the forced boarding at CORMORANT on the worked route; the scripted first seed at depth 3
// (the tutorial run's Telemetry seed, whatever the noise); nominalRouteThreat. INFO: the share of routes with two or more
// HOLLOW ships when every seed is left (slice-2 risk 2, moved to the route). (The final hop's link spread, risk 6, went
// with the link: playtest 1, note 20.)
import { check, finish } from '../landing/checks';
import type { RunMapState } from '@/types/map';
import type { RunThreatState, ShipThreat, LinkNoise } from '@/types/threat';
import { mapFacts, oneHopFromFinal, nominalRouteThreat } from '@systems/map-facts';
import { planThreat, threatInputFor, applyThreat, createRunThreat, NO_FINAL_TRACES } from '@systems/threat-plan';
import { routes, bestRoute, type Route } from '@systems/map-route';
import { hopBetween } from '@systems/map-hop';
import { rollNoiseClouds } from '@systems/map-noise';
import { noiseRng } from '@systems/map-run';
import { freshArm } from '@systems/map-generator';
import { createRng, type Rng } from '@systems/rng';
import { BEAM_SEED_ODDS, RUN_START_YEAR } from '@data/tuning';
import { byDepth } from '../depth';
import { run1Map, WORKED_ROUTE } from './run1-fixture';

const map = run1Map(7);

// One route flown on the ladder: `seedsLeft(depth, plan)` is how many beam seeds the kid leaves on each ship (they report
// home as TRACE, or feed HOLLOW once it is aboard: 04 §3.7).
function fly(m: RunMapState, route: Route, seedsLeft: (depth: number, plan: ShipThreat) => number): { plans: ShipThreat[]; threat: RunThreatState } {
  let threat = createRunThreat();
  const plans: ShipThreat[] = [];
  route.forEach((slot, index) => {
    const facts = index === 0
      ? { depth: 1, isFinal: false, oneHopFromFinal: false, beamSeeds: { kind: 'none' as const } }
      : mapFacts(m, route[index - 1]!, slot, index + 1);
    const plan = planThreat(threatInputFor(threat, facts, false, NO_FINAL_TRACES));
    threat = applyThreat(threat, plan);
    plans.push(plan);
    const left = plan.act === 'calm' || plan.act === 'finale' ? 0 : seedsLeft(index + 1, plan);
    if (threat.aboard) threat = { ...threat, fed: threat.fed + left };
    else threat = { ...threat, trace: threat.trace + left };
  });
  return { plans, threat };
}
const acts = (plans: readonly ShipThreat[]): string => plans.map((plan) => (plan.stage ?? plan.act) + (plan.folded.length > 0 ? `+${plan.folded.join('+')}` : '')).join(' ');

// A: the best 5-ship route, two seeds left at depth 3 (TRACE 2): HOLLOW is forced at depth 4 (one hop from the final ship).
const routeA = bestRoute(map, true).get(5)!;
const a = fly(map, routeA, (depth) => (depth === 3 ? 2 : 0));
check(`A, 5 ships [${routeA.join(', ')}]: calm, calm, seeds, HOLLOW boards (forced) as ARRIVAL + WALLS, FINALE + DEAL`,
  acts(a.plans) === 'calm calm seeds arrival+walls finale+hunt' && a.plans[3]!.boards === 'forced', acts(a.plans));

// B: an 8-ship route whose layer-6 ship is not Avalon (so depth 6 is not one hop from New Haven), every seed rm'd.
const eight = routes(map).filter((route) => route.length === 8);
const routeB = eight.find((route) => !oneHopFromFinal(map, route[5]!))!;
const b = fly(map, routeB, () => 0);
check(`B, 8 ships clean and careful [${routeB.join(', ')}]: a quiet middle, HOLLOW forced at depth 7 (ARRIVAL + WALLS), FINALE`,
  acts(b.plans) === 'calm calm seeds seeds seeds seeds arrival+walls finale+hunt' && b.plans[6]!.boards === 'forced', acts(b.plans));

// C: the same route, sloppy: 2 seeds left at depth 3, 1 at depth 4 (TRACE 3): HOLLOW boards by TRACE at depth 5, then
// WALLS, SEEDS, FINALE.
const c = fly(map, routeB, (depth) => (depth === 3 ? 2 : depth === 4 ? 1 : 0));
check('C, 8 ships noisy and sloppy: TRACE 3 by depth 4, HOLLOW boards by TRACE at depth 5 (ARRIVAL), then WALLS, SEEDS, FINALE',
  acts(c.plans) === 'calm calm seeds seeds arrival walls seeds finale+hunt' && c.plans[4]!.boards === 'trace', acts(c.plans));

// M3 and the worked route.
check('M3 on run 1: CORMORANT is one hop from LAST LIGHT, VESPER (83 LY) is not', oneHopFromFinal(map, 15) && !oneHopFromFinal(map, 11));
const nominal = nominalRouteThreat(map, WORKED_ROUTE.slice(0, 5));
check('the worked route: HOLLOW boards at CORMORANT (depth 5), forced, as ARRIVAL + WALLS; LAST LIGHT plays FINALE',
  nominal.boardedAtDepth === 5 && nominal.boardCause === 'forced' && nominal.stagesPlayed.join() === 'arrival,walls'
  && nominalRouteThreat(map, WORKED_ROUTE).stagesPlayed.includes('finale'));
const k = mapFacts(map, 2, 5, 3);
check('the depth-3 beam keeps the scripted Telemetry seed (the tutorial run\'s RM lesson), later runs its hop\'s noise',
  k.beamSeeds.kind === 'scripted' && JSON.stringify(k.beamSeeds.firstRun) === JSON.stringify([{ role: 'telemetry' }]) && k.beamSeeds.later === hopBetween(map, 2, 5).noise
  && mapFacts(map, 5, 11, 4).beamSeeds.kind === 'noise');

// --- INFO: two or more HOLLOW ships when every seed is left; the final hop's link -----------------------------------------
function seedsRolled(rng: Rng, noise: LinkNoise): number {
  const odds = BEAM_SEED_ODDS[noise];
  let r = rng();
  for (let seeds = 0; seeds < odds.length; seeds++) { if (r < odds[seeds]!) return seeds; r -= odds[seeds]!; }
  return odds.length - 1;
}
const arms: RunMapState[] = [
  { ...map, noise: rollNoiseClouds(noiseRng(7)) },
  ...Array.from({ length: byDepth(6, 30) }, (_, i): RunMapState => ({
    ...map, run: 2, armSeed: 300 + i, arm: freshArm(300 + i, 2, RUN_START_YEAR), noise: rollNoiseClouds(noiseRng(300 + i)),
  })),
];
let flown = 0;
let twoPlus = 0;
const rng = createRng(11);
for (const arm of arms) {
  for (const route of routes(arm)) {
    const run = fly(arm, route, (_depth, plan) => {
      const source = plan.beamSeeds;
      if (source.kind === 'none') return 0;
      if (source.kind === 'scripted') return arm === arms[0] ? source.firstRun.length : seedsRolled(rng, source.later);
      return seedsRolled(rng, source.noise);
    });
    flown++;
    if (run.plans.filter((plan) => plan.act === 'hollow').length >= 2) twoPlus++;
  }
}
console.log(`INFO  routes with ≥ 2 HOLLOW ships when every seed is left: ${twoPlus} of ${flown} (${((100 * twoPlus) / flown).toFixed(0)}%) on ${arms.length} arms (run 1 + fresh rolls, noise rolled per run)`);
finish();
