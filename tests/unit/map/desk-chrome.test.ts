// Slice 3a DESK: the words round the map (02-map §4, 01-landing §4, 05 §3.12): the header crumb's galaxy year on the arm
// (`UNIT-047 / KESTREL · 2467 / FLYBY`) and its desk and TRANSMIT crumbs, the MIND header's `MEMORY 384 · FULL`, and the
// title line `UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT`; the desk's opening once per visit (the review's m3, m4).
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
import { hopBetween } from '@systems/map-hop';
import { shipSummaryAt } from '@systems/map-run';
import { deskOpening } from '@systems/desk';
import { BEAM_OUT_BLACKOUT_SEC } from '@data/tuning';

// The title and the desk read no flight prediction (headerCrumbs returns before it; the title's vars are the run's).
const NO_PRED = { zoneHits: [], burnPoint: null } as unknown as Prediction;
const store = createStore<GameState>(createInitialState({ seed: 4, shipIndex: 0, phase: 'title' }));
let crumbs = headerCrumbs(store.getState(), NO_PRED);
check('classic world: the crumb has no year (its years are fixtures)', crumbs.year === null && crumbs.ship === 'ARES-VII');
check('the MIND header: MEMORY 384 · FULL (the classic ARES-VII)', memoryClassLabel(store.getState()) === 'MEMORY 384 · FULL');
check('the title line: UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT', LINES.titleUnit(lineVars(store.getState(), NO_PRED)) === 'UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT',
  LINES.titleUnit(lineVars(store.getState(), NO_PRED)));

const map = run1Map(4);
map.route = [{ slot: 0, depth: 1, hop: null }];
store.update((draft) => { draft.run.map = map; draft.run.phase = 'desk'; });
crumbs = headerCrumbs(store.getState(), NO_PRED);
check('the arm: the crumb carries the galaxy year, and the desk names itself', crumbs.year === 2300 && crumbs.phase.text === MAP_TEXT.desk.title);
// At KESTREL (the worked route's third ship) the crumb reads its own approach year, as the header joins it.
const atKestrel = run1Map(4);
atKestrel.route = [0, 2, 5].map((slot, i, slots) => ({ slot, depth: i + 1, hop: i === 0 ? null : hopBetween(atKestrel, slots[i - 1]!, slot) }));
atKestrel.galaxyYear = atKestrel.arm[5]!.approachYear;
store.update((draft) => { draft.run.map = atKestrel; draft.run.shipIndex = 2; });
crumbs = headerCrumbs(store.getState(), NO_PRED);
check('…at KESTREL: `UNIT-047 / KESTREL · 2467 / STAR CHART`', MAP_TEXT.crumb(crumbs.unit, shipSummaryAt(atKestrel, 5).name, crumbs.year ?? 0, crumbs.phase.text)
  === 'UNIT-047 / KESTREL · 2467 / STAR CHART', JSON.stringify(crumbs));
store.update((draft) => { draft.run.phase = 'transmit'; });
check('…TRANSMIT names itself', headerCrumbs(store.getState(), NO_PRED).phase.text === MAP_TEXT.desk.packetCrumb);

// The desk's opening plays once per desk visit (the review's m3: every ◀ CHART return replayed the greying chimes and
// CONTROL's line), and after a BEAM OUT waits for the blackout on that first open only (m4: it delayed the PACKET on every
// open instead).
store.update((draft) => { draft.run.phase = 'desk'; });
const first = deskOpening(store.getState(), null);
const back = deskOpening(store.getState(), first.visit);
check('the desk opening plays on a visit\'s first open, not on the open back from the PACKET', first.replay && !back.replay && first.blackoutSec === 0);
store.update((draft) => {
  draft.burn.status = 'abandoned';
  draft.run.ships.push({ ...structuredClone(draft.run.ships[0] ?? {}), shipName: 'KESTREL', slot: 5 } as never);
});
const beamOut = deskOpening(store.getState(), back.visit);
const beamOutBack = deskOpening(store.getState(), beamOut.visit);
check('…a new ship ended is a new visit; after a BEAM OUT its first open waits the blackout, the return from the PACKET does not',
  beamOut.replay && beamOut.blackoutSec === BEAM_OUT_BLACKOUT_SEC && !beamOutBack.replay && beamOutBack.blackoutSec === 0);
finish();
