// Slice 3c Track WORLD: 02 §3.14's update to run 2 as the world update's fixture (slice-3c-plan §4.3, §6.1): run 1's arm
// plus the worked route through updateArm with §3.14's rolls scripted (tests/unit/world/run2-fixture.ts run2Dice) gives run
// 2's arm cell by cell: every ship by slot (name, kind, year, late, pods, class, runs on the chart), the whole ArmShip
// equal to the fixture's (details, reservations, the Debris guarantee), the 12 waiting ships byte-identical but runsOnChart,
// the departures and their words, the gap, serial and floor, the first attempt passing, ALBATROSS 13 years early and run 2's
// best routes by length. Then the map createRunMap builds from it, and an INFO block of what the kid sees changed. Pure (<1 s).
import { isDeepStrictEqual } from 'node:util';
import { check, finish } from '../landing/checks';
import { updateArm, freshArmState, armContent, nextLaunchOf } from '@systems/map-update';
import { createRunMap } from '@systems/map-run';
import { routes, routePods } from '@systems/map-route';
import { hopBetween } from '@systems/map-hop';
import { assembleRun1Arm } from '@systems/map-generator';
import { worldAt } from '@data/arm';
import {
  run2Dice, run2Arm, run2History, RUN2_EXPECTED, RUN2_DEPARTURES, RUN2_BEST_BY_LENGTH, RUN1_RESULTS, RUN2_START,
} from './run2-fixture';
import { WORKED_ROUTE } from '../map/run1-fixture';

const visited = RUN1_RESULTS.map((result) => ({ slot: result.slot, colony: result.landed > 0 }));

for (const seed of [1, 3, 7]) {
  const from = freshArmState(seed, 1, 2300, null);
  const update = updateArm({ from, visited }, () => run2Dice());
  const next = update.next;
  const rows = next.ships.map((ship) => ({
    slot: ship.slot, name: ship.name, kind: ship.kind, year: ship.approachYear, late: ship.late, pods: ship.pods, memoryClass: ship.memoryClass,
    runsOnChart: ship.runsOnChart,
  }));
  const wrong = rows.filter((row, i) => !isDeepStrictEqual(row, RUN2_EXPECTED[i]));
  check(`seed ${seed}: run 2's arm is §3.14's, cell by cell (name, kind, year, late, pods, class, runs on the chart)`, wrong.length === 0,
    wrong.map((row) => `${JSON.stringify(row)} ≠ ${JSON.stringify(RUN2_EXPECTED[row.slot])}`).join(' | '));
  const fixture = run2Arm(seed);
  const differ = next.ships.filter((ship) => !isDeepStrictEqual(ship, fixture.ships[ship.slot]));
  check(`seed ${seed}: …every ArmShip equals the fixture's whole (details, reservations topped up, the Debris guarantee)`,
    differ.length === 0, differ.map((ship) => ship.name).join(', '));
  const run1 = assembleRun1Arm(seed);
  const waiting = next.ships.filter((ship) => ship.reportedRun === 1);
  check(`seed ${seed}: 12 ships wait, each on its 2nd run, byte-identical to run 1's but runsOnChart`, waiting.length === 12
    && waiting.every((ship) => JSON.stringify({ ...ship, runsOnChart: 1 }) === JSON.stringify(run1[ship.slot])), `${waiting.length}`);
  check(`seed ${seed}: the arm state: run 2 from 2301 (gap 1, no valve), serial 1, LODESTAR 3021 on its floor, the content`,
    next.run === 2 && next.startYear === RUN2_START && next.gap === 1 && next.valveYears === 0 && next.finalSerial === 1
    && isDeepStrictEqual(next.lastFinal, { name: 'LODESTAR', year: 3021 }) && isDeepStrictEqual(next.content, armContent())
    && next.armSeed === seed);
  const departed = isDeepStrictEqual(next.departures, RUN2_DEPARTURES);
  check(`seed ${seed}: the departures: the six done with their colonies (route order), PETREL core-coming, SHEARWATER own-way`,
    departed, departed ? '' : JSON.stringify(next.departures));
  check(`seed ${seed}: the first attempt passes, no valve, best route 69 pods; reasons done 6, resolved 2, nothing else`,
    update.attempts === 1 && !update.valveOpened && update.bestPods === 69
    && isDeepStrictEqual(update.reasons, { 'done': 6, 'first-past': 0, 'drifted': 0, 'aged': 0, 'resolved': 2, 'off-pattern-ark': 0, 'made-room': 0, 'unreachable': 0 }),
    `${update.attempts} ${update.bestPods} ${JSON.stringify(update.reasons)}`);
  check(`seed ${seed}: the arm is equal to the fixture's ArmState as a whole`, isDeepStrictEqual(next, fixture));
}

// The map run 2 starts on (createRunMap from the stored arm and the lineage's history).
const update = updateArm({ from: freshArmState(1, 1, 2300, null), visited }, () => run2Dice());
const map = createRunMap({ wave: 2, armSeed: 1, arm: update.next, history: run2History() }, 11);
check('createRunMap builds run 2 from the stored arm: its ships, 2301, the arm seed, the history; ARES-VIII is ship 1',
  isDeepStrictEqual(map.arm, update.next.ships) && map.startYear === 2301 && map.galaxyYear === 2301 && map.armSeed === 1 && map.run === 2
  && isDeepStrictEqual(map.history, run2History()) && map.arm[0]!.name === 'ARES-VIII');
check('…and refuses an arm for another run, or one another build made', (() => {
  const refuses = (fn: () => unknown): boolean => { try { fn(); return false; } catch { return true; } };
  return refuses(() => createRunMap({ wave: 3, armSeed: 1, arm: update.next, history: run2History() }, 11))
    && refuses(() => createRunMap({ wave: 2, armSeed: 1, arm: { ...update.next, content: { ...update.next.content, update: 0 } }, history: run2History() }, 11));
})());
const albatross = hopBetween(map, 0, 6);
check('ALBATROSS is 13 years early from ARES-VIII (it was 14 from ARES-VII)', albatross.slackYears === 13, `${albatross.slackYears}`);
const best: Record<number, number> = {};
for (const route of routes(map)) best[route.length] = Math.max(best[route.length] ?? 0, routePods(map, route) * 200);
check('run 2\'s best routes by length: 13,200 / 13,800 / 13,600 / 12,800 (the same values as run 1, through other ships)',
  Object.entries(RUN2_BEST_BY_LENGTH).every(([length, colonists]) => best[Number(length)] === colonists), JSON.stringify(best));
const launch = nextLaunchOf(47, update.next);
check('run.next for the bridging line: UNIT-048, run 2, 2301, gap 1, no valve years',
  isDeepStrictEqual(launch, { unit: 48, run: 2, startYear: 2301, gap: 1, valveYears: 0 }));

// INFO: run 2 on the worked route, as the kid meets it.
const newShips = update.next.ships.filter((ship) => ship.reportedRun === 2);
console.log(`INFO  run 2: UNIT-048 launched ${launch.gap} year after UNIT-047, in ${launch.startYear}; final ship ${update.next.lastFinal?.name} ${update.next.lastFinal?.year}`);
console.log(`INFO  left the chart: ${update.next.departures.filter((d) => d.reason !== 'done').map((d) => `${d.name} (${d.words})`).join(', ')}; done: ${WORKED_ROUTE.length}`);
console.log(`INFO  reported home: ${newShips.map((ship) => `${ship.name} at ${worldAt(ship.slot).name} ${ship.approachYear}${ship.late ? ' late' : ''} ${ship.pods} ${ship.memoryClass}${ship.modifiers.includes('debris') ? ' DEBRIS' : ''}${ship.reserved.resident ? ` [${ship.reserved.resident.kind}]` : ''}${ship.reserved.unknownEvent ? ` [?${ship.reserved.unknownEvent}]` : ''}`).join(' · ')}`);
console.log(`INFO  2nd run on the chart: ${update.next.ships.filter((ship) => ship.runsOnChart === 2).map((ship) => ship.name).join(', ')}`);

finish();
