// Slice 3c foundation: the §3.14 fixture (tests/unit/world/run2-fixture.ts) is what 02 §3.14 says, so Track UI can build
// against it and Track WORLD's update-fixture can compare updateArm with it: every ship of run 2's arm by slot (name, kind,
// year, late, pods, class, runs on the chart), the 12 waiting ships byte-identical to run 1's but runsOnChart, 6 light ships
// and 3 arks, the checks passing, every ShipDef valid, ALBATROSS 13 years early from ARES-VIII, run 2's best routes by
// length, the trail and the dice. Pure (<1 s).
import { check, finish } from '../landing/checks';
import { run2Arm, run2Map, run2Dice, RUN2_EXPECTED, RUN2_BEST_BY_LENGTH, RUN1_TRAIL, RUN1_LAST_UNIT, RUN2_START } from './run2-fixture';
import { assembleRun1Arm, armChecks, bases } from '@systems/map-generator';
import { routes, routePods } from '@systems/map-route';
import { hopBetween } from '@systems/map-hop';
import { shipDefOf, validateShipDef } from '@data/ships';
import { coloniesOf } from '@systems/lineage';
import { WORKED_ROUTE } from '../map/run1-fixture';

const arm = run2Arm(1);
const run1 = assembleRun1Arm(1);

const rows = arm.ships.map((ship) => ({
  slot: ship.slot, name: ship.name, kind: ship.kind, year: ship.approachYear, late: ship.late, pods: ship.pods, memoryClass: ship.memoryClass,
  runsOnChart: ship.runsOnChart,
}));
const wrong = rows.filter((row, i) => JSON.stringify(row) !== JSON.stringify(RUN2_EXPECTED[i]));
check('run 2\'s arm is §3.14\'s, ship by ship (name, kind, year, late, pods, class, runs on the chart)', wrong.length === 0,
  wrong.map((row) => `${JSON.stringify(row)} ≠ ${JSON.stringify(RUN2_EXPECTED[row.slot])}`).join(' | '));

const waiting = arm.ships.filter((ship) => ship.reportedRun === 1);
check('12 ships wait, each on its 2nd run, byte-identical to run 1\'s but runsOnChart',
  waiting.length === 12 && waiting.every((ship) => ship.runsOnChart === 2
    && JSON.stringify({ ...ship, runsOnChart: 1 }) === JSON.stringify(run1[ship.slot])), `${waiting.length} waiting`);
check('the arm is back to 6 light ships and 3 arks', arm.ships.filter((ship) => ship.kind === 'light').length === 6
  && arm.ships.filter((ship) => ship.kind === 'ark').length === 3);
check('the checks pass (first attempt), and every ship builds a valid ShipDef', armChecks(arm.ships).length === 0
  && arm.ships.every((ship) => { validateShipDef(shipDefOf(ship)); return true; }), JSON.stringify(armChecks(arm.ships)));
check('new ships are timed against 2301 and reported on run 2; the ARES and the final ship by run and serial',
  arm.ships.filter((ship) => ship.reportedRun === 2).every((ship) => ship.timedAgainstStart === RUN2_START)
  && arm.ships[0]!.name === 'ARES-VIII' && arm.ships[19]!.name === 'LODESTAR' && arm.finalSerial === 1
  && arm.lastFinal?.name === 'LODESTAR' && arm.lastFinal.year === 3021 && arm.gap === 1 && arm.startYear === 2301);

const map = run2Map(1);
const albatross = hopBetween(map, 0, 6);
check('ALBATROSS is 13 years early from ARES-VIII (it was 14 from ARES-VII)', albatross.slackYears === 13, `${albatross.slackYears}`);
const best: Record<number, number> = {};
for (const route of routes(map)) best[route.length] = Math.max(best[route.length] ?? 0, routePods(map, route) * 200);
check('run 2\'s best routes by length: 13,200 / 13,800 / 13,600 / 12,800', Object.entries(RUN2_BEST_BY_LENGTH)
  .every(([length, colonists]) => best[Number(length)] === colonists), JSON.stringify(best));
check('run 2\'s bases are run 1\'s plus the gap', JSON.stringify(bases(2301).slice(1)) === JSON.stringify(bases(2300).slice(1).map((year) => year + 1)));

check('UNIT-047\'s trail: the worked route, six colonies, 11,000 landed, no grey cross',
  RUN1_TRAIL.stops.map((stop) => stop.slot).join() === WORKED_ROUTE.join() && coloniesOf(RUN1_TRAIL).length === 6
  && RUN1_LAST_UNIT.landed === 11_000 && RUN1_TRAIL.lost === null);

const dice = run2Dice();
const petrel = run1.find((ship) => ship.name === 'PETREL')!;
const shearwater = run1.find((ship) => ship.name === 'SHEARWATER')!;
check('the dice: gap 1, PETREL core-coming, SHEARWATER own-way, the rest stay, Cinder takes the ark, Marrow and Greywater first',
  dice.gap() === 1 && dice.resolve(petrel) === 'core-coming' && dice.resolve(shearwater) === 'own-way'
  && run1.filter((ship) => ship !== petrel && ship !== shearwater).every((ship) => dice.resolve(ship) === null)
  && dice.pick('ark-slot', [11]) === 11 && dice.order([2, 13, 5, 1]).join() === '13,1,2,5'
  && dice.name(['BELLWETHER', 'PATIENCE']) === 'BELLWETHER');

finish();
