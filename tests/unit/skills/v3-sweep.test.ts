// BALANCE_ONLY: v2 ROUND vs v3 over run 1's authored ships on the arm × damage states (plan R15; also plan 4's missing ROUND sweep), whole landings.
// Slice 4e, Track ORBIT (slice-4cde-plan §8.3). Information until slice 8, not a balance target: each of run 1's five authored
// ships on the arm (ARES-VII, HALCYON, KESTREL, VESPER, LAST LIGHT: harness9 shipAlone, the arm fixture since Track RETIRE)
// locked in LANDING on a low ellipse (▼ at 0.45 of the band, e 0.03) or on a capture's loop (▼ at 0.3 of the
// band, ▲ a step under its top), healthy or damaged (Sensor Interp and every driver at 70%: a ×2.25 drop), landed by the
// strip (followLanding: a kid who obeys it, manual pods) with no AUTOBURN, with v2 (one [B]: ROUND) and with v3 (one [B]:
// LANDING ORBIT). Per row: FUEL used, wall seconds to the first drop, pods landed in an LZ, points, v3's top-ups and the
// windows they cost (R13), and the wall s to reach the landing orbit. A landing still open after MAX_WALL is ended there.
// Slice 8 Step 0 (slice-8-plan §2.2, OD 3): re-baselined on the arm. Its rows name the ship the fixture built; V3_SHIPS (names,
// comma-separated) flies some of them; per ship it prints v3 against v2 ROUND (pods, first drop, FUEL), and BALANCE_JSON
// writes `v3.Δpods.damaged` (the worse of VESPER's and LAST LIGHT's ×2.25 rows, v3's pods over v2's, both starts),
// `v3.Δfirst-drop-s` (v3's first drop against v2's on those rows, mean) and `v3.Δfuel.healthy` (v3's FUEL against v2's on
// every healthy row, mean; negative: v3 burns less).
// The arm's numbers at fa323d6 (--full, the slice-8 Step 0 baseline of this sweep; the classic five's are slice-4cde's M5):
// • healthy low: v2 ROUND FUEL −7.6%, v3 −4.8%, 45/46 pods both; healthy capture: v2 −35.9%, v3 −19.4%, 45 against 44 pods;
// • damaged low: v2 −7.6%, v3 −20.8%, 40 against 37 pods; damaged capture: v2 −35.9%, v3 −33.4%, 40 against 34 pods;
// • v3 over v2 on the ×2.25 ships: VESPER −4 pods (low 12 = 12, capture 9 against 13), LAST LIGHT −1 (13 against 14, 13 = 13);
//   the first drop 7 s sooner on average (VESPER low 27 against 39 s); healthy FUEL −1.9 points a row;
// • every LAST LIGHT row is still open at MAX_WALL (the final ship's landing does not end by the strip here; not read further
//   in Step 0): its pods are counted where they stand, and its rows take most of the sweep's time.
import { check, finish } from '../wp1/harness';
import { writeMetrics } from '../support/balance-out';
import { createHarness9 } from '../wp9/harness9';
import { lockOn, ensureLandingKeys, followLanding } from '../landing/harness-landing';
import { giveSkillFile } from '../support/skills';
import { setLandingMode } from '../support/landing-instant';
import { autoburnRefusal } from '@systems/autoburn';
import { landingOrbitAim } from '@systems/autoburn-v3';
import { getPrediction } from '@systems/predict';
import { on } from '@systems/events';
import { endLanding } from '@systems/landing';
import { DRIVER_RULES } from '@data/script';
import type { GameState } from '@state/schema';

const h = createHarness9(5);
setLandingMode('manual');
const state = (): GameState => h.store.getState();
const LANDING_DONE = [...DRIVER_RULES.map((rule) => rule.id), 'engine-io-fault', 'lesson-dot-wide', 'lesson-drag-sinks'];
const SHIPS = ['ARES-VII', 'HALCYON', 'KESTREL', 'VESPER', 'LAST LIGHT'];
// V3_SHIPS: the ships flown (names, comma-separated), all five by default.
const FLOWN = (process.env.V3_SHIPS ?? SHIPS.join(',')).split(',');
if (!FLOWN.every((name) => SHIPS.includes(name))) throw new Error(`V3_SHIPS=${process.env.V3_SHIPS}: not one of ${SHIPS.join(', ')}`);

interface Row {
  ship: string; damage: string; start: Start; auto: 'none' | 'v2' | 'v3'; ended: boolean;
  fuelUsed: number; firstDropSec: number | null; landed: number; pods: number; points: number; maxPoints: number;
  wallSec: number; targetAlt: number | null; orbitSec: number | null; topUps: number; costs: number; lowers: number;
}

const MAX_WALL = 1500;
type Start = 'low' | 'capture';

function setUp(index: number, damaged: boolean, version: 0 | 2 | 3, start: Start): void {
  if (index === 0) h.reset(1); else h.shipAlone(index, 1);
  h.store.update((draft) => {
    draft.hollow.phase = 'dormant';
    draft.director.done.push(...LANDING_DONE);
    for (const seg of draft.memory) {
      if (!('integrity' in seg)) continue;
      const hurt = damaged && (seg.role === 'sensor' || seg.type === 'driver');
      (seg as { integrity: number }).integrity = hurt ? 70 : 100;
    }
  });
  if (version > 0) giveSkillFile(h.store, 'autoburn', version as 2 | 3, 2);
  ensureLandingKeys(h);
  const ring = state().level.ring;
  if (start === 'low') lockOn(h, { r: ring.min + 0.45 * (ring.max - ring.min), e: 0.03, argPeriDeg: 40 });
  else {
    const rp = ring.min + 0.3 * (ring.max - ring.min);
    const ra = ring.max - 100;
    lockOn(h, { r: rp, e: (ra - rp) / (ra + rp), argPeriDeg: 40 });
  }
  h.stepFor(0.2);
}

function flyRow(index: number, damaged: boolean, auto: Row['auto'], start: Start): Row {
  setUp(index, damaged, auto === 'none' ? 0 : auto === 'v2' ? 2 : 3, start);
  const R = state().level.planet.R;
  const fuel0 = state().burn.fuelPct;
  const wall0 = h.wall();
  let firstDrop: number | null = null;
  let orbitAt: number | null = null;
  let topUps = 0;
  let lowers = 0;
  const offLaunch = on('pod-launched', () => { firstDrop ??= h.wall() - wall0; });
  const offLower = on('autoburn-v3-lower', () => { lowers++; });
  const logFrom = state().log.entries.length;
  let aimAlt: number | null = null;
  if (auto !== 'none') {
    h.stepUntil(() => autoburnRefusal(state(), getPrediction()) === null, 400);
    if (auto === 'v3') aimAlt = (landingOrbitAim(state(), getPrediction())?.targetKm ?? NaN) - R;
    h.press('KeyB');
    h.step();
  }
  let wasArmed = false;
  followLanding(h, {
    maxWall: MAX_WALL,
    onTick: () => {
      const a = state().burn.auto;
      if (orbitAt === null && a.holding) orbitAt = h.wall() - wall0;
      const burning = a.phase === 'pointing' || a.phase === 'burning';
      if (a.holding && burning && !wasArmed) topUps++;
      wasArmed = burning;
    },
  });
  offLaunch();
  offLower();
  const ended = state().run.phase !== 'landing';
  if (!ended) { endLanding(h.store); h.stepFor(1); }
  const lines = state().log.entries.slice(logFrom).map((entry) => entry.text);
  const pods = state().landing.pods;
  const down = pods.filter((record) => record.fate.kind === 'down');
  const landed = down.filter((record) => record.fate.kind === 'down' && record.fate.touchdown.lz !== null).length;
  const points = down.reduce((sum, record) => sum + (record.fate.kind === 'down' ? record.fate.touchdown.points : 0), 0);
  const maxPoints = pods.reduce((sum, record) => sum + record.colonists, 0);
  return {
    ship: state().level.shipName, damage: damaged ? 'damaged' : 'healthy', start, auto, ended, fuelUsed: fuel0 - (state().landing.fuelAtEndPct ?? state().burn.fuelPct),
    firstDropSec: firstDrop, landed, pods: pods.length, points, maxPoints, wallSec: h.wall() - wall0,
    targetAlt: aimAlt, orbitSec: orbitAt, topUps, costs: lines.filter((text) => text.startsWith('AUTOBURN v3: TOP-UP COSTS')).length, lowers,
  };
}

const rows: Row[] = [];
for (let index = 0; index < SHIPS.length; index++) {
  if (!FLOWN.includes(SHIPS[index]!)) continue;
  for (const damaged of [false, true]) for (const start of ['low', 'capture'] as const) {
    for (const auto of ['none', 'v2', 'v3'] as const) {
      const row = flyRow(index, damaged, auto, start);
      rows.push(row);
      console.log(`INFO ${row.ship.padEnd(10)} ${row.damage.padEnd(7)} ${row.start.padEnd(7)} ${row.auto.padEnd(4)}: FUEL −${row.fuelUsed.toFixed(1)}%, first drop `
        + `${row.firstDropSec?.toFixed(0) ?? '—'} s, landed ${row.landed}/${row.pods}, points ${row.points}/${row.maxPoints}, ${row.wallSec.toFixed(0)} wall s`
        + (row.ended ? '' : ' (still open: ended there)')
        + (row.auto === 'v3' ? `; R* ${row.targetAlt?.toFixed(0)} km up, at it after ${row.orbitSec?.toFixed(0) ?? '—'} s, `
          + `${row.topUps} top-ups (${row.costs} cost a window), ${row.lowers} GOES LOWER` : ''));
      // Information only (slice 8 rebalances): the landing ended by the strip or at MAX_WALL, and the tank never went under 0.
      check(`${row.ship} ${row.damage} ${row.start} ${row.auto}: flown to its end, FUEL never under 0`, row.fuelUsed <= 100 && row.pods > 0,
        `${row.ended ? 'ended' : 'ended at MAX_WALL'}`);
    }
  }
}
// R15's question, per ship and damage state: v3 against v2 ROUND.
for (const damage of ['healthy', 'damaged']) for (const start of ['low', 'capture'] as const) {
  const pick = (auto: Row['auto']) => rows.filter((row) => row.damage === damage && row.start === start && row.auto === auto);
  const v2 = pick('v2');
  const v3 = pick('v3');
  const sum = (list: Row[], key: 'fuelUsed' | 'landed' | 'points' | 'pods' | 'maxPoints') => list.reduce((total, row) => total + row[key], 0);
  const meanFirst = (list: Row[]) => list.reduce((total, row) => total + (row.firstDropSec ?? 0), 0) / list.length;
  console.log(`INFO R15 ${damage} ${start}: v2 ROUND FUEL −${sum(v2, 'fuelUsed').toFixed(1)}% landed ${sum(v2, 'landed')}/${sum(v2, 'pods')} `
    + `points ${sum(v2, 'points')}/${sum(v2, 'maxPoints')} first drop ${meanFirst(v2).toFixed(0)} s; v3 FUEL −${sum(v3, 'fuelUsed').toFixed(1)}% `
    + `landed ${sum(v3, 'landed')}/${sum(v3, 'pods')} points ${sum(v3, 'points')}/${sum(v3, 'maxPoints')} first drop ${meanFirst(v3).toFixed(0)} s`);
}
const v3Rows = rows.filter((row) => row.auto === 'v3');
console.log(`INFO R13: ${v3Rows.reduce((t, r) => t + r.topUps, 0)} top-ups over the v3 landings, ${v3Rows.reduce((t, r) => t + r.costs, 0)} cost a window`);

// Slice 8 Step 0 (§2.2): v3 against v2 ROUND per ship and damage, both starts summed, and the balance report's rows.
const pair = (ship: string, damage: string) => (['low', 'capture'] as const).map((start) => {
  const of = (auto: Row['auto']) => rows.find((row) => row.ship === ship && row.damage === damage && row.start === start && row.auto === auto)!;
  return { v2: of('v2'), v3: of('v3') };
});
const flownShips = [...new Set(rows.map((row) => row.ship))];
for (const ship of flownShips) for (const damage of ['healthy', 'damaged']) {
  const pairs = pair(ship, damage);
  console.log(`INFO v3 − v2 ${ship.padEnd(10)} ${damage.padEnd(7)}: pods ${pairs.reduce((t, p) => t + p.v3.landed - p.v2.landed, 0)}, points `
    + `${pairs.reduce((t, p) => t + p.v3.points - p.v2.points, 0)}, first drop ${pairs.map((p) => ((p.v3.firstDropSec ?? 0) - (p.v2.firstDropSec ?? 0)).toFixed(0)).join(' / ')} s, `
    + `FUEL ${pairs.map((p) => (p.v3.fuelUsed - p.v2.fuelUsed).toFixed(1)).join(' / ')} points`);
}
const hard = ['VESPER', 'LAST LIGHT'].filter((ship) => flownShips.includes(ship));
const hardPods = hard.map((ship) => pair(ship, 'damaged').reduce((t, p) => t + p.v3.landed - p.v2.landed, 0));
const hardFirst = hard.flatMap((ship) => pair(ship, 'damaged').map((p) => (p.v3.firstDropSec ?? 0) - (p.v2.firstDropSec ?? 0)));
const healthyFuel = flownShips.flatMap((ship) => pair(ship, 'healthy').map((p) => p.v3.fuelUsed - p.v2.fuelUsed));
const meanOf = (values: readonly number[]): number | null => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);
writeMetrics('v3-sweep', {
  'v3.Δpods.damaged': hardPods.length === 0 ? null : Math.min(...hardPods),
  ...Object.fromEntries(hard.map((ship, i) => [`v3.Δpods.damaged.${ship.replace(/\W/g, '')}`, hardPods[i]!])),
  'v3.Δfirst-drop-s': meanOf(hardFirst),
  'v3.Δfuel.healthy': meanOf(healthyFuel),
}, { ships: flownShips.join(',') });
finish();
