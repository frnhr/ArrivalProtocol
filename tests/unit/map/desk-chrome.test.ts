// Slice 3a DESK: the words round the map (02-map §4, 01-landing §4, 05 §3.12): the header crumb's galaxy year on the arm
// (`UNIT-047 / KESTREL · 2467 / FLYBY`) and its desk and TRANSMIT crumbs, the MIND header's `MEMORY 384 · FULL`, and the
// title line `UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT` with the logo `ARRIVAL PROTOCOL // OUTWARD BOUND`.
import { check, finish } from '../landing/checks';
import { createStore } from '@state/store';
import type { GameState } from '@state/schema';
import { createInitialState } from '@state/initial';
import { headerCrumbs } from '@systems/flight-hud';
import type { Prediction } from '@systems/predict';
import { memoryClassLabel } from '@components/memory-view/MemoryStats';
import { LINES, lineVars } from '@data/script';
import { MAP_TEXT } from '@data/map-text';
import { run1Map } from './run1-fixture';

// The title and the desk read no flight prediction (headerCrumbs returns before it; the title's vars are the run's).
const NO_PRED = { zoneHits: [], burnPoint: null } as unknown as Prediction;
const store = createStore<GameState>(createInitialState({ seed: 4, shipIndex: 0, phase: 'title' }));
let crumbs = headerCrumbs(store.getState(), NO_PRED);
check('classic world: the crumb has no year (its years are fixtures)', crumbs.year === null && crumbs.ship === 'ARES-VII');
check('the MIND header: MEMORY 384 · FULL (the classic ARES-VII)', memoryClassLabel(store.getState()) === 'MEMORY 384 · FULL');
check('the title line: UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT', LINES.titleUnit(lineVars(store.getState(), NO_PRED)) === 'UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT',
  LINES.titleUnit(lineVars(store.getState(), NO_PRED)));
check('…under ARRIVAL PROTOCOL // OUTWARD BOUND', MAP_TEXT.title.logo === 'ARRIVAL PROTOCOL // OUTWARD BOUND');

const map = run1Map(4);
map.route = [{ slot: 0, depth: 1, hop: null }];
store.update((draft) => { draft.run.map = map; draft.run.phase = 'desk'; });
crumbs = headerCrumbs(store.getState(), NO_PRED);
check('the arm: the crumb carries the galaxy year, and the desk names itself', crumbs.year === 2300 && crumbs.phase.text === MAP_TEXT.desk.title);
check('…`UNIT-047 / KESTREL · 2467 / FLYBY` as the header joins it', MAP_TEXT.crumb('UNIT-047', 'KESTREL', 2467, 'FLYBY') === 'UNIT-047 / KESTREL · 2467 / FLYBY');
store.update((draft) => { draft.run.phase = 'transmit'; });
check('…TRANSMIT names itself', headerCrumbs(store.getState(), NO_PRED).phase.text === MAP_TEXT.desk.packetCrumb);
finish();
