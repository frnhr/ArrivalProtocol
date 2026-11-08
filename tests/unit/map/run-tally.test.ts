// Slice 3a DESK: the RUN TALLY's model (systems/run-end.ts runEndModel; 02-map §4), on run 1's arm with a crafted end
// (the worked route ARES-VII → HALCYON → KESTREL → VESPER → CORMORANT → LAST LIGHT): one row per visited ship
// (`3 · KESTREL · 2467 · LANDED 1,000 / 1,200`) and no NOT REACHED row, the route for the mini chart, `n COLONIES
// FOUNDED`, the fleet's colonists from the visited ships, and ranks absolute on the arm (rankBasis) while the classic
// world keeps phase 2's scaling.
import { check, finish } from '../landing/checks';
import { createStore } from '@state/store';
import type { GameState, ShipResult, ShipOutcome } from '@state/schema';
import type { RouteStop } from '@/types/map';
import { createInitialState } from '@state/initial';
import { runEndModel, rankBasis, fleetColonists, rankSteps } from '@systems/run-end';
import { hopBetween } from '@systems/map-hop';
import { classicRunMap } from '@systems/map-run';
import { MAP_TEXT } from '@data/map-text';
import { RANK_FLEET_COLONISTS } from '@data/tuning';
import { run1Map, WORKED_ROUTE } from './run1-fixture';

function result(name: string, slot: number, depth: number, outcome: ShipOutcome, landed: number, points: number): ShipResult {
  return {
    shipId: `ship-${slot}`, shipName: name, slot, depth, outcome, stars: landed > 0 ? 2 : 0, fuelLeftPct: 30, ringMiss: null, survey: null,
    colonistsAboard: landed, lzs: [], offSite: 0, noGo: 0, restored: 0, parked: [], notLaunched: 0, landedInLz: landed, points,
    colony: landed > 0 ? 'X' : null, pods: [],
  };
}

const store = createStore<GameState>(createInitialState({ seed: 4, shipIndex: 0, phase: 'desk' }));
const map = run1Map(4);
map.route = WORKED_ROUTE.map((slot, i): RouteStop => ({ slot, depth: i + 1, hop: i === 0 ? null : hopBetween(map, WORKED_ROUTE[i - 1]!, slot) }));
map.galaxyYear = 3020;
const rows: [string, ShipOutcome, number, number][] = [
  ['ARES-VII', 'locked', 600, 690], ['HALCYON', 'locked', 800, 1520], ['KESTREL', 'partial', 1000, 1700],
  ['VESPER', 'locked', 2600, 4800], ['CORMORANT', 'crashed', 0, 0], ['LAST LIGHT', 'locked', 2800, 5200],
];
store.update((draft) => {
  draft.run.map = map;
  draft.run.shipIndex = WORKED_ROUTE.length - 1;
  draft.run.ships = rows.map(([name, outcome, landed, points], i) => result(name, WORKED_ROUTE[i]!, i + 1, outcome, landed, points));
  draft.run.endCause = 'won-purge';
  draft.run.phase = 'end';
});
const model = runEndModel(store.getState());
check('the RUN TALLY: six rows, one per visited ship, in route order, none NOT REACHED',
  model.ships.length === 6 && model.ships.map((row) => row.shipName).join() === rows.map((row) => row[0]).join()
  && model.tallyTitle === MAP_TEXT.tally.title);
check('…`3 · KESTREL · 2467 · LANDED 1,000 / 1,200`', model.ships[2]!.tallyLine === '3 · KESTREL · 2467 · LANDED 1,000 / 1,200', model.ships[2]!.tallyLine);
check('…each row has its year and its ship\'s colonists (VESPER 2625, 3,200)', model.ships[3]!.year === 2625 && model.ships[3]!.colonists === 3200);
check('…the route for the mini chart', model.route.join() === WORKED_ROUTE.join());
check('…5 COLONIES FOUNDED (CORMORANT crashed: none there)', model.colonies === 5 && model.coloniesLine === '5 COLONIES FOUNDED');
check('…the fleet is the visited ships: 600 + 1,000 + 1,200 + 3,200 + 1,800 + 3,200 = 11,000',
  model.fleetColonists === 11000 && fleetColonists(store.getState().run.map) === 11000, String(model.fleetColonists));
check('…ranks absolute on the arm: SHEPHERD 3,000, CARETAKER 6,800, ARK ANGEL 10,700 (score 13,910 is ARK ANGEL)',
  rankBasis(store.getState().run.map) === RANK_FLEET_COLONISTS && rankSteps(RANK_FLEET_COLONISTS).map((step) => step.minScore).join() === '0,3000,6800,10700'
  && model.score === 13910 && model.rank === 'ARK ANGEL', `${model.score} ${model.rank}`);
check('…PURGE counts the visited ships: 5 OF 6 HOME', /5 OF 6/.test(model.title), model.title);
check('the classic world keeps phase 2\'s scaling by its five ships (9,600 colonists)', rankBasis(classicRunMap(0, 0, 1)) === 9600 && fleetColonists() === 9600);
// Slice 3b: the tally's one line for the repository's files that never arrived (02 §3.9): none requested here.
check('3b: no NEVER ARRIVED line on a run that requested nothing (review m8: `NEVER ARRIVED: —` said nothing)', model.undeliveredLine === null, model.undeliveredLine ?? 'null');
store.update((draft) => {
  draft.run.repo.requests = [{ id: 'rq1', file: 'mv', fromSlot: 0, toSlot: 2, requestedYear: 2300, lateness: 0, status: 'delivered', at: 2, arrivedYear: 2337 }];
});
check('…`NEVER ARRIVED: —` once it asked and everything came', runEndModel(store.getState()).undeliveredLine === 'NEVER ARRIVED: —');
store.update((draft) => {
  draft.run.repo.requests.push({ id: 'rq2', file: 'swap', fromSlot: 5, toSlot: 11, requestedYear: 2467, lateness: 4, status: 'in-transit', at: null, arrivedYear: null });
});
check('…`NEVER ARRIVED: Swap` for one still on its way at the end', runEndModel(store.getState()).undeliveredLine === 'NEVER ARRIVED: Swap',
  runEndModel(store.getState()).undeliveredLine ?? 'null');
finish();
