// Slice 1a, Track UI: the LANDING REPORT's view model (src/systems/landing-report.ts). Pure: worlds from the foundation's
// constructors with each pod's fate written by hand (no store, no mounts, nothing flown).
import { check, finish } from './checks';
import type { GameState } from '@state/schema';
import type { LaunchRecord, Place, PodFate, Touch } from '@/types/landing';
import { createInitialState } from '@state/initial';
import { createStore } from '@state/store';
import { phase2Ship } from '../support/hollow-world';
import { beginLanding } from '@state/actions';
import { podPoints } from '@systems/landing-rules';
import { landingReportModel } from '@systems/landing-report';
import { isDriver } from '@state/selectors';
import { HARD_WORDS_POOL } from '@data/souls';

// Track RETIRE: run 1's arm ships, HALCYON and KESTREL with phase 2's racks and landings (support/hollow-world phase2Ship:
// LZ-A 3 / LZ-B 2, and three WIDE sites of 4 for 12 pods), the splits these reports were written for; run 1's own split
// theirs differently (4 / 1, and 3 / 3 for 6).
function world(shipIndex: number): GameState {
  const built = createInitialState({ seed: 11, shipIndex, carried: 'fresh' });
  let state = built;
  if (shipIndex === 1 || shipIndex === 2) {
    const store = createStore<GameState>(built);
    phase2Ship(store, shipIndex);
    state = store.getState();
  }
  state.run.phase = 'report';
  state.burn.status = 'locked';
  beginLanding(state);
  return state;
}

function launch(rad: number, touch: Touch): LaunchRecord {
  return {
    atTSec: 0, atAi: 0, source: 'player', launchRadius: 6000, dotRad: rad, halfWidthKm: 78, aimLz: null, landingRad: rad,
    predictedTouch: touch, driverIntegrity: touch === 'soft' ? 100 : 40, arc: [], descentSec: 3.5, firstOfRun: false,
  };
}

function setFate(state: GameState, pod: number, fate: PodFate): void {
  const record = state.landing.pods.find((candidate) => candidate.pod === pod);
  if (!record) throw new Error(`no pod ${pod}`);
  record.fate = fate;
  if (fate.kind !== 'aboard') state.memory = state.memory.filter((seg) => !(isDriver(seg) && seg.pod === pod));
}

// A pod down at `rad`, `atAi` seconds into the landing, scored as the rules score it.
function down(state: GameState, pod: number, place: Place, lz: string | null, rad: number, touch: Touch, atAi: number, missKm: number | null = null): void {
  const points = podPoints(place, touch, state.landing.forgiveness, 200);
  setFate(state, pod, { kind: 'down', launch: launch(rad, touch), touchdown: { place, lz, points, missKm, touch, atAi } });
}

function lzRad(state: GameState, label: string): number {
  const lz = state.landing.lzs.find((candidate) => candidate.label === label);
  if (!lz) throw new Error(`no ${label}`);
  return lz.centreRad;
}

// --- ARES-VII, run 1: all three down in LZ-A, POD 02 hard ---

{
  const state = world(0);
  const a = lzRad(state, 'LZ-A');
  down(state, 1, 'lz', 'LZ-A', a, 'soft', 5);
  down(state, 2, 'lz', 'LZ-A', a, 'hard', 7);
  down(state, 3, 'lz', 'LZ-A', a, 'soft', 9);
  state.landing.colony = 'RIVERSIDE';
  const model = landingReportModel(state);
  check('route: ARES-VII → KEPLER-186F · PLAINS · GENTLE', model.route === 'ARES-VII → KEPLER-186F · PLAINS · GENTLE', model.route);
  check('colony: they are calling it RIVERSIDE', model.colonyLine === 'they are calling it RIVERSIDE');
  check('headline: LANDED 600 / 600 (hard counts as landed)', model.headline === 'LANDED 600 / 600', model.headline);
  const row = model.rows[0];
  check('LZ row: LZ-A 600 / 600 ✓ with soft, hard, soft icons', row?.kind === 'lz' && row.line === 'LZ-A 600 / 600 ✓'
    && row.text === '600 / 600 ✓' && row.icons.join() === 'soft,hard,soft' && row.tone === 'good', JSON.stringify(row));
  check('stub lines kept: lzRows / otherRows', model.lzRows.join() === 'LZ-A 600 / 600 ✓' && model.otherRows.length === 0);
  const lead = model.credits[0];
  check('credits: Ada Okafor first, with her words', lead?.lead === true && lead.line === 'OKAFOR, ADA (11) · LZ-A · “Is it morning?”', lead?.line);
  const hard = model.credits.find((credit) => credit.pod === 2);
  check('credits: the hard pod says a hard-landing line', hard !== undefined && HARD_WORDS_POOL.includes(hard.colonist.words)
    && hard.where === 'LZ-A · HARD', hard?.line);
  check('credits: touchdown order after the lead', model.credits.map((credit) => credit.pod).join() === '1,2,3');
  check('points: 200 + 100 + 200', model.points === 500 && model.pointsText === '500 POINTS', model.pointsText);
  check('stars: ON TARGET 2/3 missed by the hard pod', model.stars.find((star) => star.id === 'on-target')?.earned === false
    && model.stars.find((star) => star.id === 'on-target')?.label === 'ON TARGET 2/3');
  check('charge: two stars, +12 on the next ship', model.charge === 12 && model.chargeLine === '+12 REPAIR CHARGE ON NEXT SHIP', model.chargeLine);
  check('breakdown: 400 soft · 200 hard', model.breakdown === '400 soft · 200 hard · 0 mislanded · 0 off-site', model.breakdown);
  check('continue: CONTINUE ▸, not the last ship', model.continueText === 'CONTINUE ▸ [SPACE]' && !model.lastShip && !model.finalShip);
}

// --- HALCYON: LZ-A overfilled, LZ-B short, an off-site near miss, a parked pod ---

{
  const state = world(1);
  const R = state.level.planet.R;
  const a = lzRad(state, 'LZ-A');
  const lzB = state.landing.lzs.find((lz) => lz.label === 'LZ-B')!;
  down(state, 1, 'lz', 'LZ-A', a, 'soft', 4);
  down(state, 2, 'lz', 'LZ-A', a, 'soft', 6);
  down(state, 3, 'lz', 'LZ-A', a, 'soft', 8);
  down(state, 4, 'mislanded', 'LZ-A', a, 'soft', 10);
  setFate(state, 5, { kind: 'parked', why: 'eaten', restorable: true });
  let model = landingReportModel(state);
  const [rowA, rowB] = model.rows;
  check('LZ-A: 600 / 600 ✓, three in and one mislanded', rowA?.line === 'LZ-A 600 / 600 ✓' && rowA.icons.join() === 'soft,soft,soft,mislanded',
    JSON.stringify(rowA));
  check('LZ-B: 0 / 400 · 400 SHORT, two empty slots', rowB?.line === 'LZ-B 0 / 400 · 400 SHORT' && rowB.icons.join() === 'empty,empty'
    && rowB.tone === 'short', JSON.stringify(rowB));
  const parked = model.rows.find((row) => row.kind === 'parked');
  check('parked: POD 05 · PARKED IN ORBIT · fate unknown, why, beacon icon', parked?.line === 'POD 05 · PARKED IN ORBIT · fate unknown'
    && parked.icons.join() === 'parked' && parked.why === 'its driver was eaten', JSON.stringify(parked));
  check('credits: no line for the parked pod (the lead) — first down leads', model.credits.length === 4 && model.credits[0]?.pod === 1
    && !model.credits.some((credit) => credit.pod === 5));
  check('credits: the mislanded pod names its full LZ', model.credits.find((credit) => credit.pod === 4)?.where === 'LZ-A FULL');
  check('headline: LANDED 600 / 1,000 (mislanded is not on target)', model.headline === 'LANDED 600 / 1,000', model.headline);
  check('points: 600 + 150', model.points === 750);
  check('breakdown: each colonist once (review: the mislanded pod was in soft too)',
    model.breakdown === '600 soft · 0 hard · 200 mislanded · 0 off-site', model.breakdown);
  check('the report reads the state (ship name, destination, final ship), not a fixed fleet', model.route.startsWith(`${state.level.shipName} → ${state.mission.destination}`)
    && !model.lastShip);

  // POD 04 comes down 40 km past LZ-B's far edge instead: off-site, half points on a GENTLE world, a near miss.
  down(state, 4, 'off-site', null, lzB.centreRad + lzB.halfWidthRad + 40 / R, 'soft', 10, 40);
  model = landingReportModel(state);
  const off = model.rows.find((row) => row.kind === 'off-site');
  check('off-site: OFF-SITE 200 with its icon', off?.line === 'OFF-SITE 200' && off.icons.join() === 'off-site', JSON.stringify(off));
  check('near miss: POD 04 landed 40 km outside LZ-B', model.nearMisses[0] === 'POD 04 landed 40 km outside LZ-B', model.nearMisses.join());
  check('credits: the off-site pod is credited OFF-SITE (it scored 100)', model.credits.find((credit) => credit.pod === 4)?.where === 'OFF-SITE');
}

// --- KESTREL: HARSH, an off-site pod scores 0 and gets no credit ---

{
  const state = world(2);
  const a = lzRad(state, 'LZ-A');
  for (let pod = 1; pod <= 11; pod++) down(state, pod, 'lz', pod <= 4 ? 'LZ-A' : pod <= 8 ? 'LZ-B' : 'LZ-C', a, 'soft', pod);
  down(state, 12, 'off-site', null, a + Math.PI, 'soft', 20, 300);
  const model = landingReportModel(state);
  check('harsh: the off-site pod scores 0 and has no credit line', !model.credits.some((credit) => credit.pod === 12) && model.credits.length === 11);
  check('harsh: route says HARSH', model.route.endsWith('· OCEAN · HARSH'), model.route);
  check('harsh: LZ-C 600 / 800 · 200 SHORT', model.lzRows[2] === 'LZ-C 600 / 800 · 200 SHORT', model.lzRows.join(' | '));
}

// --- LAST LIGHT: the final ship ---

{
  const state = world(4);
  for (const record of state.landing.pods) setFate(state, record.pod, { kind: 'parked', why: 'no-time', restorable: false });
  const model = landingReportModel(state);
  check('final ship: the last ship\'s line and RUN END', model.finalShip && model.lastShip && model.continueText === 'RUN END ▸ [SPACE]'
    && model.chargeLine === 'THE LAST SHIP · the run ends here', model.chargeLine);
  check('final ship: every pod parked, LANDED 0 / 3,200, no credits', model.headline === 'LANDED 0 / 3,200' && model.credits.length === 0
    && model.rows.filter((row) => row.kind === 'parked').length === 16);
}

finish();
