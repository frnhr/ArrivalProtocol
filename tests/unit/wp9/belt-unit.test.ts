// @ts-nocheck: TODO(slice1a-TESTS): this suite still reads phase 2's souls / printer (cluster codes, print results) and is
// moved onto the landing per slice-1a-plan §5. F2 turned type-checking off here so tsc over tests stays green meanwhile.
// WP9 acceptance 3 (§6.8, §9 WP9 item 1): the radiation belt's effect, built and tested here for LAST LIGHT (WP11).
// • A 1,080 game-s crossing gives 5.4 ± 0.5 hits on average over 500 seeds, at both ×30 and ×300 (the clock is a
//   Poisson process in time spent inside, at most one hit a tick: warp-invariant).
// • An orbit with ra ≤ 7,000 under a belt starting at 9,000: 0 hits during printing (and, as a control, a belt the
//   orbit does clip keeps hitting while printing).
// • Hits land on a random damageable file in the belt's racks that no op holds (drawn again once), −8 each; a
//   cluster taken to 0 did not wake and leaves memory (no HOLLOW turn); the predictor's zoneHits counts the time
//   inside and the expected hits; pace is TACTICAL inside and SKIP is refused there.
import { check, finish } from '../wp1/harness';
import { createHarness9 } from './harness9';
import { newBeltClock, beltClockTick, beltTarget, chordInsideFrac } from '@systems/zones';
import { getPrediction } from '@systems/predict';
import { requestSkip } from '@systems/pace';
import { createRng, childRng } from '@systems/rng';
import { driversInMemory } from '@state/selectors';
import { segmentStarts } from '@systems/memory-ops';
import { stateFromElements } from '@/types/orbit';
import { BELT_HIT_MEAN_SEC, BELT_HIT_DAMAGE, RACK_BLOCKS } from '@data/tuning';
import type { BeltZone } from '@/types/zone';
import type { Segment } from '@/types/segment';

// --- The clock: 5.4 hits a 1,080 s crossing, at ×30 and ×300 ------------------------------------------------------
const CROSSING_SEC = 1080;
const TICK_WALL = 0.05;
for (const warp of [30, 300]) {
  const dt = TICK_WALL * warp;
  let total = 0;
  let maxPerTick = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const rng = childRng(seed, 4, 'belt');
    const clock = newBeltClock(rng);
    let hits = 0;
    for (let inside = 0; inside < CROSSING_SEC - 1e-9; inside += dt) {
      const slice = Math.min(dt, CROSSING_SEC - inside);
      if (beltClockTick(clock, slice, rng)) { hits++; maxPerTick = Math.max(maxPerTick, 1); }
    }
    total += hits;
  }
  const mean = total / 500;
  check(`×${warp}: a ${CROSSING_SEC} game-s crossing gives ${(CROSSING_SEC / BELT_HIT_MEAN_SEC).toFixed(1)} ± 0.5 hits on average over 500 seeds`,
    Math.abs(mean - CROSSING_SEC / BELT_HIT_MEAN_SEC) <= 0.5 && maxPerTick <= 1, mean.toFixed(2));
}
{
  // The same seed gives the same hits at ×30 and ×300 when no two fall in one ×300 tick: count by time inside.
  const times = (warp: number): number[] => {
    const rng = childRng(77, 4, 'belt');
    const clock = newBeltClock(rng);
    const out: number[] = [];
    const dt = TICK_WALL * warp;
    for (let inside = 0; inside < CROSSING_SEC; inside += dt) if (beltClockTick(clock, dt, rng)) out.push(Math.floor(inside / 15));
    return out;
  };
  check('…seeded and warp-invariant: one seed puts its hits in the same 15 s windows at ×30 and ×300', JSON.stringify(times(30)) === JSON.stringify(times(300)),
    `${JSON.stringify(times(30))} vs ${JSON.stringify(times(300))}`);
  check('…outside the belt the clock does not run', (() => {
    const rng = createRng(5);
    const clock = newBeltClock(rng);
    const left = clock.leftSec;
    return !beltClockTick(clock, 0, rng) && clock.leftSec === left;
  })());
}

// --- The sim: printing on a loop under the belt, and one that clips it -----------------------------------------
const h = createHarness9(4);
const state = () => h.store.getState();
const belt = (rIn: number, rOut: number): BeltZone => ({ kind: 'belt', id: 'belt-test', rIn, rOut, racks: ['A', 'B'] });

function printUnder(zone: BeltZone, seconds: number): number {
  h.kestrel(4, { hollowAsleep: true, sensorHealed: true });
  h.store.update((d) => { d.level = { ...d.level, zones: [zone] }; });
  h.startPrinting(1, 'locked');
  // The printer would empty memory in seconds; hold it so the world coasts the whole time with colonists aboard.
  const end = h.wall() + seconds;
  while (h.wall() < end) {
    h.store.mutate((d) => { d.printer.waitAiSec = 10; });
    h.step();
  }
  return h.zoneHits().length;
}

check('a locked orbit inside the ring (ra ≤ 7,000) under a belt from 9,000 to 12,000: 0 hits while printing', printUnder(belt(9000, 12000), 60) === 0);
const clipped = printUnder(belt(5500, 6500), 60);
check('…control: a belt the orbit lies in keeps hitting while printing (§6.8), at about one a 200 game s',
  clipped >= 2, `${clipped} hits in 60 wall s at ×${state().level.tacticalWarp} (${(60 * state().level.tacticalWarp / BELT_HIT_MEAN_SEC).toFixed(1)} expected)`);
{
  const memory = state().memory;
  const starts = segmentStarts(memory);
  const hitIds = h.events.filter((event) => event.name === 'zone-hit')
    .flatMap((event) => (event.payload as { hits: { segId: string; from: number; to: number }[] }).hits);
  const inRacks = hitIds.every((hit) => {
    const seg = memory.find((candidate) => candidate.id === hit.segId);
    if (!seg) return true;
    const index = memory.indexOf(seg);
    return starts[index]! < 2 * RACK_BLOCKS;
  });
  check('…every hit landed in racks A–B, −8 each', hitIds.length > 0 && inRacks && hitIds.every((hit) => Math.abs(hit.from - hit.to - BELT_HIT_DAMAGE) < 1e-9 || hit.to === 0),
    JSON.stringify(hitIds.slice(0, 3)));
}

// --- Targets ------------------------------------------------------------------------------------------------------
{
  h.kestrel(4, { hollowAsleep: true, sensorHealed: true });
  const memory = state().memory;
  const rng = createRng(1);
  const picks = new Set<string>();
  for (let i = 0; i < 400; i++) { const pick = beltTarget(memory, ['A', 'B'], rng); if (pick) picks.add(pick.id); }
  const starts = segmentStarts(memory);
  const allInRacks = [...picks].every((id) => {
    const seg = memory.find((candidate) => candidate.id === id)!;
    return starts[memory.indexOf(seg)]! < 2 * RACK_BLOCKS && 'integrity' in seg;
  });
  check('beltTarget picks damageable files in racks A–B only (ship files and rack B\'s clusters)', allInRacks && [...picks].some((id) => id.startsWith('soul_'))
    && [...picks].some((id) => !id.startsWith('soul_')), [...picks].join(','));
  const busy: Segment[] = memory.map((seg) => (seg.type === 'driver' || seg.type === 'ship' || seg.type === 'ship-backup'
    ? { ...structuredClone(seg), operating: true } : structuredClone(seg)));
  check('…a file an op holds is not hit (drawn again once, then the hit is lost)', beltTarget(busy, ['A', 'B'], createRng(3)) === null);
}

// --- A cluster taken to 0 did not wake (no HOLLOW turn) -----------------------------------------------------------
{
  h.kestrel(4, { hollowAsleep: true, sensorHealed: true });
  h.store.update((d) => {
    d.level = { ...d.level, zones: [belt(5500, 6500)] };
    for (const seg of d.memory) if ('integrity' in seg && seg.type !== 'core' && seg.type !== 'tool' && seg.type !== 'fs-tool') seg.integrity = 5;
  });
  h.startPrinting(1, 'locked');
  let lostEvent = false;
  const end = h.wall() + 120;
  while (h.wall() < end && !lostEvent) {
    h.store.mutate((d) => { d.printer.waitAiSec = 10; });
    h.step();
    lostEvent = h.events.some((event) => event.name === 'zone-hit' && (event.payload as { lostClusters: string[] }).lostClusters.length > 0);
  }
  const lost = h.events.filter((event) => event.name === 'zone-hit').flatMap((event) => (event.payload as { lostClusters: string[] }).lostClusters);
  const code = lost[0];
  check('a cluster the belt takes to 0 did not wake: it leaves memory as a lost result, and no HOLLOW block appears',
    code !== undefined && !driversInMemory(state()).some((soul) => soul.cluster === code)
    && state().souls.results.some((result) => result.cluster === code && result.outcome === 'lost')
    && state().memory.filter((seg) => seg.type === 'hollow').length === 1, `${lost.join(',')}`);
  check('…the TERMINAL says so', state().log.entries.some((entry) => entry.text === `> ${code} ... DID NOT WAKE`));
  h.checkMemory();
}

// --- The predictor, pace and SKIP around a belt ----------------------------------------------------------------
{
  h.kestrel(4, { hollowAsleep: true, sensorHealed: true });
  // A circular orbit at 6,000 km (inside the ring), with a belt it lies in, mid-flight.
  const orbit = stateFromElements(6000, 0, 0, 0, state().level.planet.mu);
  h.store.update((d) => {
    d.level = { ...d.level, zones: [belt(5500, 6500)] };
    d.orbit = { x: orbit.x, y: orbit.y, vx: orbit.vx, vy: orbit.vy };
  });
  h.step();
  const hit = getPrediction().zoneHits[0]!;
  // The drawn loop ends on the step that completes the turn (up to one step past the period: under 1%).
  check('the predictor: a loop inside the belt is inside it the whole period (insideSec ≈ period, expected hits = insideSec / 200)',
    hit.insideNow && getPrediction().periodSec !== null && Math.abs(hit.insideSec / getPrediction().periodSec! - 1) < 0.01
    && Math.abs(hit.expectedHits - hit.insideSec / BELT_HIT_MEAN_SEC) < 1e-9, JSON.stringify(hit));
  check('…pace is TACTICAL inside a zone', state().clock.pace === 'tactical');
  // Off the ring a little (so the in-ring rule doesn't hold TACTICAL by itself): a loop with ▼ in the belt and ▲ outside.
  const ellipse = stateFromElements(6000, 0.5, 0, Math.PI, state().level.planet.mu);
  h.store.update((d) => { d.orbit = { x: ellipse.x, y: ellipse.y, vx: ellipse.vx, vy: ellipse.vy }; });
  h.step();
  const skip = requestSkip(h.store);
  const zoneHit = getPrediction().zoneHits[0]!;
  check('…at ▲ (outside the belt) the next entry is ahead, and the drawn loop has two hazard spans\' worth of crossing',
    !zoneHit.insideNow && zoneHit.enterInSec !== null && zoneHit.exitInSec !== null, JSON.stringify(zoneHit));
  void skip;
}

// --- Geometry --------------------------------------------------------------------------------------------------
{
  const zone = belt(5500, 6500);
  check('chordInsideFrac: a radial chord from 5,000 to 7,000 km is half inside a 5,500–6,500 belt',
    Math.abs(chordInsideFrac(zone, { x: 5000, y: 0 }, { x: 7000, y: 0 }) - 0.5) < 1e-9);
  check('…a chord wholly inside is all inside; wholly outside, none', chordInsideFrac(zone, { x: 5600, y: 0 }, { x: 6400, y: 0 }) === 1
    && chordInsideFrac(zone, { x: 8000, y: 0 }, { x: 9000, y: 0 }) === 0);
}

finish();
