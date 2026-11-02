// Slice 3c Track UI: the chart, the card and the opening desk on run 2 (systems/desk.ts; 02-map §4, 05-story §3.5; 3c plan
// §3 steps 4–5, §6.1 `map/run2-chart`, risk 10), pure on §3.14's run-2 fixture (tests/unit/world/run2-fixture.ts: UNIT-047's
// worked route as the archive's last unit, the updated arm, the unit on ARES-VIII in 2301). Pins the last unit's trail
// (TAKEN until the galaxy year passes a stop, then its colony with its age, `NO COLONY`, the grey cross), the beacon on the
// first ship's world, the nodes' history (`REPORTED HOME` on the first desk only, `2ND RUN ON THE CHART`), the card's
// history and trail rows, the departures block (first desk only, folded past LEAVE_BLOCK_MAX_LINES), CONTROL's
// `UNIT-047 got here first. :)`, the opening beat's green turns, and the older colonies' dots once the year reaches them.
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { RouteStop, RunMapState } from '@/types/map';
import type { Departure, LastUnit } from '@/types/lineage';
import { createInitialState } from '@state/initial';
import {
  chartModel, chartTrail, chartLegend, cardModel, deskDepartures, departuresBlock, deskControlLine, deskOpeningBeat, olderColonyDots, trail046,
} from '@systems/desk';
import { hopBetween } from '@systems/map-hop';
import { WORLDS } from '@data/arm';
import { MAP_TEXT } from '@data/map-text';
import { LEAVE_BLOCK_MAX_LINES } from '@data/tuning';
import { run2Map, RUN1_LAST_UNIT, RUN1_TRAIL } from '../world/run2-fixture';
import { run1Map } from './run1-fixture';

// Run 2 at the desk after the last ship of `route` (ARES-VIII first), the archive's last unit `last`.
function deskAt(route: readonly number[], last: LastUnit = RUN1_LAST_UNIT): GameState {
  const state = createInitialState({ seed: 1, shipIndex: 0, phase: 'desk', map: run2Map(1) });
  const map: RunMapState = state.run.map;
  map.route = route.map((slot, i): RouteStop => ({ slot, depth: i + 1, hop: i === 0 ? null : hopBetween(map, route[i - 1]!, slot) }));
  map.galaxyYear = map.route.at(-1)!.hop?.approachYear ?? map.startYear;
  state.run.shipIndex = route.length - 1;
  state.run.lastUnit = structuredClone(last);
  state.run.unitNumber = 48;
  return state;
}

const first = deskAt([0]);
const trail = chartTrail(first.run);
const mark = (slot: number) => trail?.marks.find((m) => m.slot === slot && m.kind !== 'lost');
const chart = chartModel(first);
const node = (slot: number) => chart.nodes.find((n) => n.slot === slot)!;

check('run 2, first desk (2301): one mark per stop of UNIT-047\'s trail, no cross after a PURGE', trail !== null && trail.unit === 47
  && trail.marks.length === RUN1_TRAIL.stops.length && !trail.marks.some((m) => m.kind === 'lost'), JSON.stringify(trail?.marks.map((m) => m.kind)));
check('…RIVERSIDE (2300) is passed: `RIVERSIDE · 1 YEAR OLD · UNIT-047`', mark(0)?.kind === 'colony' && mark(0)?.label === 'RIVERSIDE · 1 YEAR OLD · UNIT-047',
  mark(0)?.label);
check('…HALCYON\'s world is TAKEN: `HALCYON · TAKEN · UNIT-047 GETS THERE FIRST`, and so is every later stop',
  mark(2)?.label === 'HALCYON · TAKEN · UNIT-047 GETS THERE FIRST' && [2, 5, 11, 15, 19].every((slot) => mark(slot)?.kind === 'taken'), mark(2)?.label);
check('…the beacon on the first ship\'s world: `BEACON · SET BY UNIT-047 · 1 YEAR AGO`',
  trail?.beacon?.slot === 0 && trail.beacon.label === 'BEACON · SET BY UNIT-047 · 1 YEAR AGO', trail?.beacon?.label);
check('…the live ship at a TAKEN world keeps its node (PATIENCE at Tessaly), tagged with the world\'s claim',
  node(2).name === 'PATIENCE' && node(2).taken === 'UNIT-047 GETS THERE FIRST' && node(3).taken === null && node(0).taken === null);
check('…new ships are REPORTED HOME on the first desk (the tag under the year), waiting ones on their 2ND RUN',
  node(2).history === MAP_TEXT.chart.reportedHome && node(2).tag === MAP_TEXT.chart.reportedHome
  && node(3).history === '2ND RUN ON THE CHART' && node(3).tag === null && node(0).tag === null, `${node(2).tag} ${node(3).history}`);
check('…the chart carries the trail (the title and the desk draw it); no older colonies yet (run 1 founded the only ones)',
  chart.trail?.marks.length === 6 && chart.older.length === 0);

const patience = cardModel(first, 2);
const osprey = cardModel(first, 3);
const row = (card: typeof patience, key: string) => card.rows.find((r) => r.key === key);
check('the card: PATIENCE\'s HISTORY reads REPORTED HOME and its LAST UNIT row HALCYON\'s TAKEN words',
  row(patience, 'history')?.value === 'REPORTED HOME' && row(patience, 'trail')?.value === 'HALCYON · TAKEN · UNIT-047 GETS THERE FIRST',
  JSON.stringify(patience.rows.map((r) => `${r.key}:${r.value}`)));
check('…OSPREY (a waiting ship) reads 2ND RUN ON THE CHART and has no trail row', row(osprey, 'history')?.value === '2ND RUN ON THE CHART'
  && row(osprey, 'trail') === undefined);

const leave = deskDepartures(first);
check('the departures block on the first desk: the two ships that moved on, in the future tense (not the trail\'s own)',
  leave !== null && leave.title === '2 SHIPS MOVED ON' && leave.lines.join(' | ') === 'PETREL · ANOTHER CORE IS ON ITS WAY | SHEARWATER · IT WILL COME IN ON ITS OWN'
  && leave.more === null, JSON.stringify(leave));
const many: Departure[] = Array.from({ length: 9 }, (_, i) => ({ slot: i, name: `SHIP${i}`, reason: 'drifted', words: 'own-way' }));
const folded = departuresBlock([...many, { slot: 19, name: 'LAST LIGHT', reason: 'done', words: 'colony' }]);
check(`…past ${LEAVE_BLOCK_MAX_LINES} lines it folds into +n MORE (the hover keeps all), and a done ship is never listed`,
  folded !== null && folded.lines.length === LEAVE_BLOCK_MAX_LINES - 1 && folded.more === `+${9 - (LEAVE_BLOCK_MAX_LINES - 1)} MORE`
  && folded.all.length === 9 && departuresBlock([{ slot: 0, name: 'ARES-VII', reason: 'first-past', words: null }]) === null);
check('CONTROL at the first desk: `UNIT-047 got here first. :)`', deskControlLine(first) === 'UNIT-047 got here first. :)', String(deskControlLine(first)));
check('…no green turn on the first desk (the title already showed RIVERSIDE)', deskOpeningBeat(first).greened.length === 0);

// --- Later desks ----------------------------------------------------------------------------------------------------------
const osprey2352 = deskAt([0, 3]);
const at2352 = chartTrail(osprey2352.run);
const mark2352 = (slot: number) => at2352?.marks.find((m) => m.slot === slot && m.kind !== 'lost');
check(`at OSPREY's desk (${osprey2352.run.map.galaxyYear}): HALCYON is still TAKEN; RIVERSIDE is 52 YEARS OLD`,
  osprey2352.run.map.galaxyYear === 2352 && mark2352(2)?.kind === 'taken' && mark2352(0)?.label === 'RIVERSIDE · 52 YEARS OLD · UNIT-047',
  mark2352(0)?.label);
const patienceDesk = deskAt([0, 2]);
const year = patienceDesk.run.map.galaxyYear;
const greened = deskOpeningBeat(patienceDesk).greened;
const lantern = chartTrail(patienceDesk.run)?.marks.find((m) => m.slot === 2);
check(`at PATIENCE's desk (${year}): HALCYON's mark turned green (\`LANTERN · ${year - 2352} … · UNIT-047\`) in this desk's beat`,
  lantern?.kind === 'colony' && lantern.label === MAP_TEXT.chart.colony('LANTERN', year - 2352, 'UNIT-047') && greened.join() === '2',
  `${lantern?.label} greened ${greened.join()}`);
check('…REPORTED HOME is the first desk\'s only (the card still says it); the departures block and CONTROL\'s line are gone',
  chartModel(patienceDesk).nodes.every((n) => n.tag === null && n.history !== MAP_TEXT.chart.reportedHome)
  && row(cardModel(patienceDesk, 5), 'history')?.value === 'REPORTED HOME' && deskDepartures(patienceDesk) === null && deskControlLine(patienceDesk) === null);

// --- A lost last unit: the grey cross (05 §3.5; the ghost speaks once the new unit reaches that layer) ---------------------
const lost: LastUnit = structuredClone(RUN1_LAST_UNIT);
lost.cause = 'flagship-lost';
lost.trail!.stops = lost.trail!.stops.slice(0, 5);
const cormorant = lost.trail!.stops[4]!;
Object.assign(cormorant, { outcome: 'crashed', landed: 0, colony: null, writer: null });
// Track WORLD's trailOf: a unit lost aboard a ship has its cross on that ship's world, 0 LY past it.
lost.trail!.lost = { slot: cormorant.slot, year: cormorant.year, pastLy: 0, cause: 'flagship-lost' };
const lostTrail = chartTrail(deskAt([0], lost).run);
const crosses = lostTrail?.marks.filter((m) => m.kind === 'lost') ?? [];
const avalon = WORLDS[cormorant.slot]!;
check('lost at CORMORANT: the grey cross `UNIT-047 WAS LOST HERE` on its world is that stop\'s mark, drawn offset as the stops are',
  crosses.length === 1 && crosses[0]!.slot === cormorant.slot && crosses[0]!.label === 'UNIT-047 WAS LOST HERE' && crosses[0]!.offset
  && crosses[0]!.x === avalon.x && crosses[0]!.y === avalon.y && lostTrail?.marks.length === 5
  && !lostTrail.marks.some((m) => m.slot === cormorant.slot && m.kind !== 'lost'), JSON.stringify(crosses));
check('…the live ship at that world reads the cross on its card (LAST UNIT), and the cross stays whatever the year',
  cardModel(deskAt([0], lost), cormorant.slot).rows.find((r) => r.key === 'trail')?.value === 'UNIT-047 WAS LOST HERE'
  && chartTrail({ ...deskAt([0], lost).run, map: { ...deskAt([0], lost).run.map, galaxyYear: 2900 } })?.marks.at(-1)?.kind === 'lost');
const past = structuredClone(lost);
past.trail!.lost = { ...past.trail!.lost!, pastLy: 6 };
const pastCross = chartTrail(deskAt([0], past).run)?.marks.find((m) => m.kind === 'lost');
check('…a cross past a world (046\'s kind) is its own mark, not offset, beyond the stop',
  pastCross !== undefined && !pastCross.offset && (pastCross.x !== avalon.x || pastCross.y !== avalon.y)
  && chartTrail(deskAt([0], past).run)?.marks.length === 6);

// --- Older colonies (02 §4: faint green dots), and run 1 unchanged ---------------------------------------------------------
const olderMap = structuredClone(first.run.map);
olderMap.history.colonies.push({ run: 0, unit: 46, slot: 4, year: 2464, landed: 200, name: 'TALLGRASS' });
const trailKey = { unit: 47, run: 1 };
check('older colonies only once the galaxy year reaches them, never the trail\'s own',
  olderColonyDots(olderMap, trailKey).length === 0
  && olderColonyDots({ ...olderMap, galaxyYear: 2470 }, trailKey).map((d) => d.label).join() === 'TALLGRASS · 6 YEARS OLD · UNIT-046'
  && olderColonyDots({ ...olderMap, galaxyYear: 2470 }, null).length === 4);
check('run 1 keeps 046\'s written trail (WAYPOINT a colony, MERIDIAN and TALLGRASS TAKEN, the cross past Calder), and 046\'s beacon',
  trail046(run1Map()).map((m) => `${m.kind}:${m.colony}`).join() === 'colony:WAYPOINT,taken:MERIDIAN,taken:TALLGRASS,lost:null'
  && chartTrail({ lastUnit: null, map: run1Map() })?.beacon?.label === 'BEACON · SET BY UNIT-046 · 1 YEAR AGO');

// --- The chart's key (the desk's corner) ------------------------------------------------------------------------------------
const kinds = (state: GameState): string => chartLegend(chartModel(state)).map((item) => item.kind).join();
check('the key names only the marks the chart has: TAKEN, colony, REPORTED HOME on the first desk; the cross when lost',
  kinds(first) === 'taken,colony,new' && kinds(deskAt([0], lost)) === 'taken,colony,lost,new' && kinds(patienceDesk) === 'taken,colony'
  && chartLegend(chartModel(first))[0]?.words === 'UNIT-047 GETS THERE FIRST', `${kinds(first)} / ${kinds(deskAt([0], lost))} / ${kinds(patienceDesk)}`);
finish();
