import type { NoiseCloud } from '@/types/map';
import type { LinkNoise, ShipThreat } from '@/types/threat';
import type { Rng } from '@systems/rng';
import { segmentDistanceLy } from '@systems/map-geometry';
import { WORLDS } from '@data/arm';
import {
  BEAM_SEED_ODDS, LINK_NOISE_MAX, NOISE_CLOUD_STRENGTHS, NOISE_CLOUD_R_MIN_LY, NOISE_CLOUD_R_MAX_LY,
  NOISE_CLOUD_SOL_MIN_LY, NOISE_CLOUD_SOL_MAX_LY, NOISE_CLOUD_LATERAL_LY, NOISE_CLOUD_MIN_GAP_LY, NOISE_CLOUD_MAX_DRAWS,
} from '@data/tuning';

// Space weather (02-map §3.3; slice-3a-plan §4.4, risk 14): the noise clouds rolled per run, a hop's link noise, and the
// card's seed range. Pure. Track GEN owns this file after the foundation.

// The run's noise clouds, rolled at RUN START from systems/map-streams.ts noiseRng(run.seed): a namespace of its own
// (not childRng(seed, 0, 'noise'), which shares visitRng's key space). Four, three of strength 1 and one of 2, radius
// 12–18 LY, centres 45–167 LY from SOL along the arm's bend, at most 16 LY to either side, no two centres closer than
// 20 LY (tuning.ts 3a GEN). "Along the arm's bend" is the centre lane (w0, w2, w5, … w19): a centre is the point of that
// polyline at its SOL distance, pushed sideways along the lane's normal. A draw closer than NOISE_CLOUD_MIN_GAP_LY to a
// cloud already placed is drawn again (at most NOISE_CLOUD_MAX_DRAWS times, then it throws: fail loudly). Clouds over a
// world are allowed (02: "a remembered ship can still sit behind a new cloud"). Whole-LY centres and radii, so a kid can
// count them.
export function rollNoiseClouds(rng: Rng): NoiseCloud[] {
  const clouds: NoiseCloud[] = [];
  for (const strength of NOISE_CLOUD_STRENGTHS) {
    let placed = false;
    for (let draw = 0; draw < NOISE_CLOUD_MAX_DRAWS && !placed; draw++) {
      const sol = NOISE_CLOUD_SOL_MIN_LY + rng() * (NOISE_CLOUD_SOL_MAX_LY - NOISE_CLOUD_SOL_MIN_LY);
      const lateral = (rng() * 2 - 1) * NOISE_CLOUD_LATERAL_LY;
      const r = NOISE_CLOUD_R_MIN_LY + Math.floor(rng() * (NOISE_CLOUD_R_MAX_LY - NOISE_CLOUD_R_MIN_LY + 1));
      const { x, y } = armAxisPoint(sol, lateral);
      const cloud: NoiseCloud = { x: Math.round(x), y: Math.round(y), r, strength };
      if (clouds.every((other) => Math.hypot(other.x - cloud.x, other.y - cloud.y) >= NOISE_CLOUD_MIN_GAP_LY)) {
        clouds.push(cloud);
        placed = true;
      }
    }
    if (!placed) throw new Error(`rollNoiseClouds: no room for cloud ${clouds.length + 1} in ${NOISE_CLOUD_MAX_DRAWS} draws`);
  }
  return clouds;
}

// The arm's centre lane, SOL first: the polyline the clouds are placed along.
const AXIS: readonly { x: number; y: number }[] = [
  { x: 0, y: 0 }, ...WORLDS.filter((world) => world.lane === 'centre').map((world) => ({ x: world.x, y: world.y })),
];

// The point `sol` LY from SOL along the centre lane (by each vertex's distance from SOL, interpolated), `lateral` LY to
// its left (positive) or right along the local segment's normal.
export function armAxisPoint(sol: number, lateral: number): { x: number; y: number } {
  for (let i = 1; i < AXIS.length; i++) {
    const a = AXIS[i - 1]!;
    const b = AXIS[i]!;
    const solA = Math.hypot(a.x, a.y);
    const solB = Math.hypot(b.x, b.y);
    if (sol > solB && i < AXIS.length - 1) continue;
    const t = Math.max(0, Math.min(1, (sol - solA) / (solB - solA)));
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / length;
    const ny = (b.x - a.x) / length;
    return { x: a.x + t * (b.x - a.x) + lateral * nx, y: a.y + t * (b.y - a.y) + lateral * ny };
  }
  throw new Error('armAxisPoint: the arm has no centre lane');
}

// A hop's noise: the strengths of the clouds whose centre lies closer than their radius to the hop's line, summed, at
// most LINK_NOISE_MAX ("count the clouds on the line").
export function hopNoise(clouds: readonly NoiseCloud[], from: number, to: number): LinkNoise {
  const sum = clouds.filter((cloud) => segmentDistanceLy(cloud.x, cloud.y, from, to) < cloud.r)
    .reduce((total, cloud) => total + cloud.strength, 0);
  return Math.min(LINK_NOISE_MAX, sum) as LinkNoise;
}

// The fewest and most seeds a beam with `noise` may carry by BEAM_SEED_ODDS (CLEAN 0, LOW 0–2, NOISY 0–3, SEVERE 0–3).
function seedOddsRange(noise: LinkNoise): { min: number; max: number } {
  const odds = BEAM_SEED_ODDS[noise];
  const possible = odds.flatMap((chance, seeds) => (chance > 0 ? [seeds] : []));
  if (possible.length === 0) throw new Error(`seedOddsRange: noise ${noise} has no seed count with a chance`);
  return { min: possible[0]!, max: possible[possible.length - 1]! };
}

// The seeds the beam into a ship may carry, from the ladder's verdict for it (the card's `SEEDS 0–2`, and the room every
// arrival preview keeps for them: systems/arrival-preview.ts). The ONE rule the card, the PACKET and the beam share (the
// review's m6: the card ignored a calm verdict the PACKET honoured, and m1: the tutorial's seed was read as noise):
// • null: none rides (a calm ship, 04 §3.4's "no seeds before depth 3"; the card says `SEEDS: none`);
// • the scripted seeds on the tutorial run (systems/beam-seeds.ts rollBeamSeeds plays them whatever the noise): exactly
//   their count, so `SEEDS 1` and the room for it;
// • otherwise the noise's odds (a later run's scripted source rolls its `later` noise).
export function seedAllowance(
  threat: Readonly<Pick<ShipThreat, 'act' | 'beamSeeds'>>, firstRun: boolean,
): { min: number; max: number } | null {
  if (threat.act === 'calm') return null;
  const source = threat.beamSeeds;
  switch (source.kind) {
    case 'none': return null;
    case 'scripted': return firstRun ? { min: source.firstRun.length, max: source.firstRun.length } : seedOddsRange(source.later);
    case 'noise': return seedOddsRange(source.noise);
  }
}
