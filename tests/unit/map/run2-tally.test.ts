// Slice 3c Track UI: the RUN TALLY's update summary and RUN END's bridging line (systems/run-end.ts runEndModel's `next`;
// 02-map §3.12, §4; 05-story §3.12; 3c plan §3 step 1), on run 1's arm ended on the worked route with run.next as the world
// update leaves it and §3.14's run-2 arm as the archive's next arm: `NEXT UNIT LAUNCHES 2301 · UNIT-048`, `THE ARM: 6 DONE ·
// 2 MOVED ON · 8 REPORTED HOME`, the ships that moved on, the valve's line when it opened, the bridge `UNIT-048 LEFT SOL 1
// YEAR AFTER YOU, IN 2301.` (the valve's years included), nothing from an arm made for another run, and nothing on the
// classic world. MERGE's next-run thread retires on the arm (3c plan risk 3).
import { check, finish } from '../landing/checks';
import type { GameState, ShipResult, ShipOutcome } from '@state/schema';
import type { RouteStop } from '@/types/map';
import type { NextLaunch } from '@/types/lineage';
import { createInitialState } from '@state/initial';
import { runEndModel, runEndNext } from '@systems/run-end';
import { hopBetween } from '@systems/map-hop';
import { MAP_TEXT } from '@data/map-text';
import { MAX_LINE_CHARS } from '@data/tuning';
import { run1Map, WORKED_ROUTE } from './run1-fixture';
import { run2Arm } from '../world/run2-fixture';

function result(name: string, slot: number, depth: number, outcome: ShipOutcome, landed: number): ShipResult {
  return {
    shipId: `ship-${slot}`, shipName: name, slot, depth, outcome, stars: 2, fuelLeftPct: 30, ringMiss: null,
    colonistsAboard: landed, lzs: [], offSite: 0, noGo: 0, restored: 0, parked: [], notLaunched: 0, landedInLz: landed, points: landed,
    colony: landed > 0 ? 'X' : null, pods: [],
  };
}

const NAMES = ['ARES-VII', 'HALCYON', 'KESTREL', 'VESPER', 'CORMORANT', 'LAST LIGHT'];
function endedRun(next: NextLaunch | null, cause: GameState['run']['endCause'] = 'won-purge'): GameState {
  const state = createInitialState({ seed: 4, shipIndex: 0, phase: 'desk' });
  const map = run1Map(4);
  map.route = WORKED_ROUTE.map((slot, i): RouteStop => ({ slot, depth: i + 1, hop: i === 0 ? null : hopBetween(map, WORKED_ROUTE[i - 1]!, slot) }));
  map.galaxyYear = 3020;
  state.run.map = map;
  state.run.shipIndex = WORKED_ROUTE.length - 1;
  state.run.ships = NAMES.map((name, i) => result(name, WORKED_ROUTE[i]!, i + 1, 'locked', 600));
  state.run.endCause = cause;
  state.run.phase = 'end';
  state.run.next = next;
  return state;
}

const NEXT: NextLaunch = { unit: 48, run: 2, startYear: 2301, gap: 1, valveYears: 0 };
const arm = run2Arm(1);
const model = runEndModel(endedRun(NEXT), arm);
const next = model.next;
check('the tally names the next unit: `NEXT UNIT LAUNCHES 2301 · UNIT-048`', next?.line === 'NEXT UNIT LAUNCHES 2301 · UNIT-048', next?.line);
check('…the arm\'s turnover from the update: `THE ARM: 6 DONE · 2 MOVED ON · 8 REPORTED HOME`, no valve',
  next?.summary === 'THE ARM: 6 DONE · 2 MOVED ON · 8 REPORTED HOME' && next.valve === null, next?.summary ?? 'none');
check('…the ships that moved on, in the future tense', next?.departures?.lines.join(' | ') === 'PETREL · ANOTHER CORE IS ON ITS WAY | SHEARWATER · IT WILL COME IN ON ITS OWN');
check('…and under NEW RUN: `UNIT-048 LEFT SOL 1 YEAR AFTER YOU, IN 2301.` `IT HAS BEEN FOLLOWING YOU ALL ALONG. YOUR TURN.`',
  next?.bridge === 'UNIT-048 LEFT SOL 1 YEAR AFTER YOU, IN 2301.' && next.bridgeTail === 'IT HAS BEEN FOLLOWING YOU ALL ALONG. YOUR TURN.', next?.bridge);

const valve = runEndNext({ unit: 48, run: 2, startYear: 2314, gap: 3, valveYears: 11 }, null);
check('the time valve: its line, and the bridge counts its years (`14 YEARS AFTER YOU, IN 2314`); no arm, no summary',
  valve?.valve === 'ARRIVAL CONTROL WAITED 11 MORE YEARS' && valve.bridge === 'UNIT-048 LEFT SOL 14 YEARS AFTER YOU, IN 2314.'
  && valve.summary === null && valve.departures === null, JSON.stringify(valve));
check('…a gap of 0: `UNIT-048 LEFT SOL IN THE SAME YEAR AS YOU, 2300.`',
  runEndNext({ unit: 48, run: 2, startYear: 2300, gap: 0, valveYears: 0 }, null)?.bridge === 'UNIT-048 LEFT SOL IN THE SAME YEAR AS YOU, 2300.');
check('an archive arm made for another run says nothing (never something wrong)', runEndNext(NEXT, { ...arm, run: 3 })?.summary === null);
check('no run.next (a world update that has not run): no summary, no bridge', runEndModel(endedRun(null), arm).next === null);
const merge = runEndModel(endedRun(NEXT, 'won-merge'), arm);
check('MERGE\'s next-run thread is gone (risk 3; the carry line deleted in the review fixes): the ending stands', merge.ending === 'merge');

const lines = [next?.line, next?.summary, valve?.valve, next?.bridge, next?.bridgeTail,
  MAP_TEXT.tally.next('UNIT-999', 3999), MAP_TEXT.tally.update(19, 19, 19), MAP_TEXT.tally.valve(11), MAP_TEXT.runEnd.bridge('UNIT-999', 46, 3999)]
  .filter((line): line is string => line !== undefined && line !== null);
check(`every tally line fits ${MAX_LINE_CHARS} characters at its worst`, lines.every((line) => line.length <= MAX_LINE_CHARS),
  lines.filter((line) => line.length > MAX_LINE_CHARS).join(' | '));
finish();
