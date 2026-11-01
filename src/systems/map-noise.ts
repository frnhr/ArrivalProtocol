import type { NoiseCloud } from '@/types/map';
import type { LinkNoise } from '@/types/threat';
import type { Rng } from '@systems/rng';
import { segmentDistanceLy } from '@systems/map-geometry';
import { BEAM_SEED_ODDS, LINK_NOISE_MAX, SEEDS_MIN_DEPTH } from '@data/tuning';

// Space weather (02-map §3.3; slice-3a-plan §4.4, risk 14): the noise clouds rolled per run, a hop's link noise, and the
// card's seed range. Pure. Track GEN owns this file after the foundation.

// The run's noise clouds (rolled at RUN START from childRng(run.seed, 0, 'noise')): four, three of strength 1 and one of
// 2, radius 12–18 LY, centres 45–167 LY from SOL along the arm's bend, at most 16 LY to either side, no two centres
// closer than 20 LY (tuning.ts 3a GEN). TODO(3a-GEN): the roll. Until then a run has no clouds: every hop is CLEAN.
export function rollNoiseClouds(rng: Rng): NoiseCloud[] {
  void rng;
  return [];
}

// A hop's noise: the strengths of the clouds whose centre lies closer than their radius to the hop's line, summed, at
// most LINK_NOISE_MAX ("count the clouds on the line").
export function hopNoise(clouds: readonly NoiseCloud[], from: number, to: number): LinkNoise {
  const sum = clouds.filter((cloud) => segmentDistanceLy(cloud.x, cloud.y, from, to) < cloud.r)
    .reduce((total, cloud) => total + cloud.strength, 0);
  return Math.min(LINK_NOISE_MAX, sum) as LinkNoise;
}

// The seeds a beam into a ship at `depth` may carry, for the card's BEAM row (`SEEDS 0–2`): null before SEEDS_MIN_DEPTH
// (`SEEDS: none`, 04 §3.4: "no seeds before depth 3"), else 0 up to the most seeds the noise's odds allow.
export function seedRange(noise: LinkNoise, depth: number): { min: number; max: number } | null {
  if (depth < SEEDS_MIN_DEPTH) return null;
  const odds = BEAM_SEED_ODDS[noise];
  let max = 0;
  odds.forEach((chance, seeds) => { if (chance > 0) max = seeds; });
  return { min: 0, max };
}
