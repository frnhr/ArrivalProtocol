// Seeded randomness. Every game roll draws from a child stream of the run seed, so a run
// replays exactly from its seed and one subsystem drawing more numbers never shifts another
// subsystem's rolls. Cosmetic randomness (glitch jerk, overlay scatter) is exempt.

export type Rng = () => number; // uniform in [0, 1)

const UINT32_RANGE = 4294967296;

// mulberry32: tiny, fast, and statistically fine for game rolls.
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

// FNV-1a over UTF-16 code units, then a final avalanche, so similar strings ("ship:0:x",
// "ship:0:y") land far apart.
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return hash >>> 0;
}

// The seed of one independent stream per (run, ship, subsystem). Counter-based noise
// (smoothNoise) takes it directly; stateful rolls go through childRng.
export function childSeed(runSeed: number, shipIndex: number, stream: string): number {
  return hashSeed(`${runSeed >>> 0}:${shipIndex}:${stream}`);
}

export function childRng(runSeed: number, shipIndex: number, stream: string): Rng {
  return createRng(childSeed(runSeed, shipIndex, stream));
}

// Smoothed value noise in [−1, 1], a pure function of time. A fresh value is drawn per
// period (hashed from the seed and the period index) and lerped to the next. Because it is
// counter-based instead of a stateful stream, the value at time t is the same whether the
// world reached t in 1-second ticks or 100-second ticks: jitter is warp-invariant.
export function smoothNoise(seed: number, tSec: number, periodSec: number): number {
  const index = Math.floor(tSec / periodSec);
  const frac = tSec / periodSec - index;
  const valueAt = (k: number): number => (hashSeed(`${seed >>> 0}#${k}`) / UINT32_RANGE) * 2 - 1;
  const from = valueAt(index);
  const to = valueAt(index + 1);
  return from + (to - from) * frac;
}

// A NEW RUN's seed (systems/run.ts startRun) and the page's first one without `?seed=`: fresh entropy.
// `?seed=` pins only the run a page opens on; the run after it is a new run.
export function newRunSeed(): number {
  const entropy = crypto.getRandomValues(new Uint32Array(1))[0];
  if (entropy === undefined) throw new Error('crypto.getRandomValues returned no value');
  return entropy;
}
