// Track GEN: the fresh-roll generator's statistics against 02-map §4.5 (docs/phase3/map-sim/results.txt, the fresh roll
// row; slice-3a-plan §4.5): bands, not points. 50 arms in quick depth, 200 at full depth. Every arm valid within
// GEN_MAX_ATTEMPTS, the first try's share, the best route's pods and length, the classes, late TIGHT ships, routes per arm,
// the span, every ship on some route; every generated ShipDef valid (the generator checks its own output), a root slot on
// every ship from layer 4, no rack D outside FULL, the Debris guarantee, the reservations' quotas. Noise (rolled per run)
// is reported as INFO: per hop, per route, and the final hop's.
import { check, finish } from '../landing/checks';
import type { RunMapState, ArmShip } from '@/types/map';
import { freshArmAttempts, armChecks } from '@systems/map-generator';
import { routes, type Route } from '@systems/map-route';
import { hopBetween, reachable } from '@systems/map-hop';
import { rollNoiseClouds } from '@systems/map-noise';
import { noiseRng, shipDefAt } from '@systems/map-run';
import { layerOf } from '@systems/map-geometry';
import { rootSlotRack } from '@data/memory';
import { END_SLOTS, FIRST_SLOT } from '@data/arm';
import { RUN_START_YEAR, LATE_TIGHT_FROM_LAYER, ROOT_SLOT_FROM_LAYER } from '@data/tuning';
import { byDepth } from '../depth';
import { MAP_STATE_VERSION, EMPTY_HISTORY } from '@data/map-state';

const ARMS = byDepth(50, 200);
const pct = (xs: readonly number[], q: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))]!;
const median = (xs: readonly number[]): number => pct(xs, 0.5);
const share = (n: number, of: number): string => `${((100 * n) / of).toFixed(0)}%`;

interface ArmStats {
  attempt: number; best: number; bestLen: number; routes: number; span: number; lateTight: number; onRoutes: number;
  classes: string[]; noiseHops: number[]; noiseRoutes: number[]; finalNoise: number[]; problems: string[];
}

function statsOf(seed: number): ArmStats {
  const { arm, attempt } = freshArmAttempts(seed, 2, RUN_START_YEAR);
  const map: RunMapState = {
    version: MAP_STATE_VERSION, world: 'arm', run: 2, armSeed: seed, startYear: RUN_START_YEAR, arm, noise: rollNoiseClouds(noiseRng(seed)),
    route: [{ slot: FIRST_SLOT, depth: 1, hop: null }], galaxyYear: RUN_START_YEAR, pendingExtra: null,
    history: EMPTY_HISTORY,
  };
  const problems: string[] = [];
  if (armChecks(arm).length > 0) problems.push(`checks: ${JSON.stringify(armChecks(arm))}`);
  const all = routes(map);
  const pods = (route: Route): number => route.reduce((sum, slot) => sum + arm[slot]!.pods, 0);
  let best = 0;
  let bestLen = 0;
  for (const route of all) {
    const p = pods(route);
    if (p > best || (p === best && route.length > bestLen)) { best = p; bestLen = route.length; }
  }
  // Ties go to the longer route here; the sim's best_len takes the shortest length reaching the best: match it.
  const lens = new Map<number, number>();
  for (const route of all) lens.set(route.length, Math.max(lens.get(route.length) ?? 0, pods(route)));
  bestLen = [...lens.keys()].sort((a, b) => a - b).find((n) => lens.get(n) === best)!;
  const onRoutes = new Set(all.flat()).size;
  for (const ship of arm) {
    const def = shipDefAt(map, ship.slot);
    if (layerOf(ship.slot) >= ROOT_SLOT_FROM_LAYER && rootSlotRack(def) === null) problems.push(`${ship.name}: no root slot in layer ${layerOf(ship.slot)}`);
    if (ship.memoryClass !== 'FULL' && ship.podRacks.D !== undefined) problems.push(`${ship.name}: rack D on ${ship.memoryClass}`);
  }
  if (![4, 5, 6].some((slot) => reachable(map, FIRST_SLOT, slot) && arm[slot]!.modifiers.includes('debris'))) problems.push('no DEBRIS ship among the layer-3 ships in reach');
  problems.push(...quotaProblems(arm, map));
  const hopNoise = new Map<string, number>();
  const noiseRoutes: number[] = [];
  const finalNoise: number[] = [];
  for (const route of all) {
    let sum = 0;
    for (let i = 1; i < route.length; i++) {
      const key = `${route[i - 1]}-${route[i]}`;
      if (!hopNoise.has(key)) hopNoise.set(key, hopBetween(map, route[i - 1]!, route[i]!).noise);
      sum += hopNoise.get(key)!;
    }
    noiseRoutes.push(sum);
  }
  for (const [key, noise] of hopNoise) if (END_SLOTS.includes(Number(key.split('-')[1]))) finalNoise.push(noise);
  return {
    attempt, best, bestLen, routes: all.length, span: arm[END_SLOTS[0]!]!.approachYear - arm[FIRST_SLOT]!.approachYear,
    lateTight: arm.filter((ship) => layerOf(ship.slot) >= LATE_TIGHT_FROM_LAYER && ship.memoryClass === 'TIGHT').length,
    onRoutes, classes: arm.map((ship) => ship.memoryClass), noiseHops: [...hopNoise.values()], noiseRoutes, finalNoise, problems,
  };
}

// 02 §3.5's placement quotas on one arm.
function quotaProblems(arm: readonly ArmShip[], map: RunMapState): string[] {
  const out: string[] = [];
  const corrupted = arm.filter((ship) => ship.reserved.resident?.kind === 'corrupted');
  if (corrupted.length > 2) out.push(`${corrupted.length} corrupted residents`);
  for (const ship of corrupted) {
    if (ship.kind === 'ark' || ship.template !== 'capture' || layerOf(ship.slot) < 4) out.push(`corrupted resident on ${ship.name} (${ship.kind}, ${ship.template})`);
    if (ship.reserved.resident!.shown === 'unknown' && (ship.memoryClass === 'TIGHT' || layerOf(ship.slot) < 6)) out.push(`hidden resident on ${ship.name}`);
  }
  if (corrupted.length === 2) {
    const [a, b] = corrupted as [ArmShip, ArmShip];
    if (Math.abs(layerOf(a.slot) - layerOf(b.slot)) < 2 || reachable(map, a.slot, b.slot)) out.push('two corrupted residents adjacent or linked');
  }
  if (arm.filter((ship) => ship.reserved.resident?.kind === 'left').length !== 5) out.push('not five departed residents');
  if (arm.filter((ship) => ship.reserved.resident?.kind === 'sleeping').length > 1) out.push('two sleepers');
  const unknown = arm.filter((ship) => ship.reserved.unknownEvent !== null);
  if (unknown.length !== 3 || new Set(unknown.map((ship) => layerOf(ship.slot))).size !== 3) out.push('the `?` ships are not three in three layers');
  if (arm.reduce((sum, ship) => sum + ship.reserved.fragments, 0) !== 5) out.push('not five fragments');
  if (arm.some((ship) => (ship.kind === 'first' || ship.kind === 'final') && (ship.reserved.resident !== null || ship.reserved.unknownEvent !== null))) {
    out.push('a resident or `?` on the first or final ship');
  }
  if (arm.some((ship) => ship.reserved.site === 'poor' && layerOf(ship.slot) < 5)) out.push('POOR site data before layer 5');
  return out;
}

const started = Date.now();
const all = Array.from({ length: ARMS }, (_, i) => statsOf(1000 + i));
const ms = Date.now() - started;
const problems = all.flatMap((stats, i) => stats.problems.map((problem) => `seed ${1000 + i}: ${problem}`));
check(`${ARMS} fresh arms rolled valid within GEN_MAX_ATTEMPTS (${ms} ms), every one passing its own checks and 02 §3.5's quotas`,
  problems.length === 0, problems.slice(0, 4).join(' | '));
const firstTry = all.filter((stats) => stats.attempt === 0).length;
const maxAttempt = Math.max(...all.map((stats) => stats.attempt)) + 1;
check(`valid first try ${share(firstTry, ARMS)} (sim 84.7%; band 70–97%), worst ${maxAttempt} attempts (sim 5)`,
  firstTry / ARMS >= 0.7 && firstTry / ARMS <= 0.97 && maxAttempt <= 12);
const best = all.map((stats) => stats.best);
check(`best route pods p1 ${pct(best, 0.01)}, p10 ${pct(best, 0.1)}, median ${median(best)}, p90 ${pct(best, 0.9)} (sim 63 / 66 / 67 / 69; bands median 66–68, p10 ≥ 64, p90 ≤ 70)`,
  median(best) >= 66 && median(best) <= 68 && pct(best, 0.1) >= 64 && pct(best, 0.9) <= 70);
const len7 = all.filter((stats) => stats.bestLen === 7).length;
const len6 = all.filter((stats) => stats.bestLen === 6).length;
check(`best route length: 6 ships ${share(len6, ARMS)}, 7 ships ${share(len7, ARMS)} (sim 40% / 60%; band: 7 ships 40–80%, 5 or 8 at most 10%)`,
  len7 / ARMS >= 0.4 && len7 / ARMS <= 0.8 && (ARMS - len6 - len7) / ARMS <= 0.1);
const classes = all.flatMap((stats) => stats.classes);
const cls = (name: string): number => classes.filter((c) => c === name).length / classes.length;
check(`classes FULL ${(100 * cls('FULL')).toFixed(0)}%, COMPACT ${(100 * cls('COMPACT')).toFixed(0)}%, TIGHT ${(100 * cls('TIGHT')).toFixed(0)}% (sim 34 / 37 / 30; bands ±6)`,
  Math.abs(cls('FULL') - 0.34) <= 0.06 && Math.abs(cls('COMPACT') - 0.37) <= 0.06 && Math.abs(cls('TIGHT') - 0.30) <= 0.06);
const lateTight = all.reduce((sum, stats) => sum + stats.lateTight, 0) / ARMS;
check(`late TIGHT ships per arm ${lateTight.toFixed(2)} (sim 2.72; band 2.0–3.4)`, lateTight >= 2 && lateTight <= 3.4);
const routeCounts = all.map((stats) => stats.routes);
check(`routes per arm: median ${median(routeCounts)}, ${Math.min(...routeCounts)}–${Math.max(...routeCounts)} (sim median 1,072, 667–1,347; band median 850–1,300)`,
  median(routeCounts) >= 850 && median(routeCounts) <= 1300 && Math.min(...routeCounts) >= 400);
const spans = all.map((stats) => stats.span);
check(`span, first to final ship: median ${median(spans)}, p10 ${pct(spans, 0.1)}, p90 ${pct(spans, 0.9)} (sim 721, 686–732; band median 705–735)`,
  median(spans) >= 705 && median(spans) <= 735);
check('every ship of every arm is on some route (sim 100%)', all.every((stats) => stats.onRoutes === 20), all.map((s) => s.onRoutes).filter((n) => n !== 20).join());

// Noise (INFO: 02 §4.5 "not simulated"; slice-3a-plan risk 14).
const hops = all.flatMap((stats) => stats.noiseHops);
const dist = (xs: readonly number[]): string => [0, 1, 2, 3].map((n) => `${['CLEAN', 'LOW', 'NOISY', 'SEVERE'][n]} ${share(xs.filter((x) => x === n).length, xs.length)}`).join(', ');
console.log(`INFO  noise per reachable hop (${hops.length}): ${dist(hops)}`);
const perRoute = all.flatMap((stats) => stats.noiseRoutes);
console.log(`INFO  noise summed per route: median ${median(perRoute)}, p10 ${pct(perRoute, 0.1)}, p90 ${pct(perRoute, 0.9)}, clean routes ${share(perRoute.filter((n) => n === 0).length, perRoute.length)}`);
const finals = all.flatMap((stats) => stats.finalNoise);
console.log(`INFO  noise on the hops into the final ship (${finals.length}): ${dist(finals)}`);
const allSevere = all.filter((stats) => stats.finalNoise.every((n) => n === 3)).length;
console.log(`INFO  arms whose every final beam is SEVERE (risk 14's re-roll trigger): ${allSevere} of ${ARMS}`);
finish();
