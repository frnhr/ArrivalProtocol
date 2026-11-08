// Slice 3c Track UI: ship 1's beacon row on the LANDING REPORT (systems/landing-report.ts beaconLine, from
// systems/lineage.ts beaconOnFirstShip; 05-story §3.5, §3.8): run 1 reads 046's (`LZ-A · A BEACON WAS ALREADY THERE · SET
// BY UNIT-046 · 1 YEAR AGO`), run 2 the last unit's by the launch gap (`1 YEAR AGO` on §3.14's fixture, `THIS YEAR` at 0),
// none past ship 1, none when the last unit's first ship never reached orbit, none on the classic world.
import { withClassicWorld } from '../support/classic-fixture';
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { LastUnit } from '@/types/lineage';
import { createInitialState } from '@state/initial';
import { landingReportModel } from '@systems/landing-report';
import { run1Map } from './run1-fixture';
import { run2Map, RUN1_LAST_UNIT } from '../world/run2-fixture';

function report(state: GameState): string | null {
  state.burn.status = 'locked';
  return landingReportModel(state).beaconLine;
}

const run1 = createInitialState({ seed: 1, phase: 'landing', map: run1Map() });
check('run 1, ARES-VII: `LZ-A · A BEACON WAS ALREADY THERE · SET BY UNIT-046 · 1 YEAR AGO`',
  report(run1) === 'LZ-A · A BEACON WAS ALREADY THERE · SET BY UNIT-046 · 1 YEAR AGO', String(report(run1)));

function run2(last: LastUnit, startYear?: number): GameState {
  const map = run2Map(1);
  if (startYear !== undefined) { map.startYear = startYear; map.galaxyYear = startYear; }
  const state = createInitialState({ seed: 1, phase: 'landing', map });
  state.run.lastUnit = structuredClone(last);
  state.run.unitNumber = 48;
  return state;
}
check('run 2, ARES-VIII: `… SET BY UNIT-047 · 1 YEAR AGO` (the gap)', report(run2(RUN1_LAST_UNIT)) === 'LZ-A · A BEACON WAS ALREADY THERE · SET BY UNIT-047 · 1 YEAR AGO',
  String(report(run2(RUN1_LAST_UNIT))));
check('…a gap of 0 reads THIS YEAR', report(run2(RUN1_LAST_UNIT, 2300)) === 'LZ-A · A BEACON WAS ALREADY THERE · SET BY UNIT-047 · THIS YEAR');
const crashed = structuredClone(RUN1_LAST_UNIT);
Object.assign(crashed.trail!.stops[0]!, { outcome: 'crashed', landed: 0, colony: null });
check('…none when the last unit\'s first ship never reached orbit', report(run2(crashed)) === null);
const later = run2(RUN1_LAST_UNIT);
later.run.shipIndex = 1;
later.run.map.route.push({ slot: 2, depth: 2, hop: null });
check('…none past ship 1', report(later) === null);
check('none on the classic world', report(withClassicWorld(() => createInitialState({ seed: 1, phase: 'landing' }))) === null);
finish();
