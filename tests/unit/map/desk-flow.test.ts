// Slice 3a F2: the DESK in the run's flow (systems/run.ts openDesk, setCourse, backToChart, goTransmit(store, toSlot);
// systems/desk.ts), headless on run 1's arm (Track RETIRE: on the classic world until its retirement, whose desk offered the
// single next ship), at HALCYON's desk on the worked route: a ship's end opens the desk with both clocks stopped and the
// ships in reach offered, SET COURSE builds the PACKET against the hop, ◀ CHART goes back and keeps a lost ship's extras,
// an unreachable slot throws, and the debug hooks' shapes are there.
import { check, finish } from '../landing/checks';
import { createStore, type Store } from '@state/store';
import type { GameState } from '@state/schema';
import { createInitialState } from '@state/initial';
import { endShip, openDesk, backToChart, goTransmit } from '@systems/run';
import { setCourseFromDesk } from '../support/desk';
import { deskCandidates, deskSteps, selectShip, cycleShip, cardModel } from '@systems/desk';
import { hopBetween, reachableFrom } from '@systems/map-hop';
import { MAP_TEXT } from '@data/map-text';

// Run 1's arm: HALCYON in slot 2, KESTREL (the worked route's next ship) in slot 5, LAST LIGHT out of reach in 19.
const HALCYON = 2;
const KESTREL = 5;
const FAR = 19;

function halcyonOver(): Store<GameState> {
  const store = createStore<GameState>(createInitialState({ seed: 4, shipIndex: 1, carried: 'fresh' }));
  store.update((draft) => { draft.run.phase = 'report'; });
  endShip(store, 'locked');
  return store;
}
const throws = (fn: () => void): boolean => { try { fn(); return false; } catch { return true; } };

const store = halcyonOver();
openDesk(store, null);
let state = store.getState();
const inReach = reachableFrom(state.run.map, HALCYON);
check('a ship\'s end opens the DESK: both clocks stopped, the desk offers the ships in reach (KESTREL among them), none picked yet',
  state.run.phase === 'desk' && state.clock.paused && deskCandidates(state).join() === inReach.join() && inReach.includes(KESTREL)
  && !inReach.includes(FAR) && state.ui.deskSelected === null && state.run.map.pendingExtra === null && !deskSteps(state)[0]!.done,
  deskCandidates(state).join());
check('…a pick: the ship is picked, SET COURSE ▸ KESTREL [ENTER] is next',
  selectShip(store, KESTREL) && deskSteps(store.getState())[0]!.done && deskSteps(store.getState())[1]!.text === MAP_TEXT.desk.setCourse('KESTREL'));
state = store.getState();
check('…the card names the ship (top line)', cardModel(state, KESTREL).top === MAP_TEXT.card.top('KESTREL', 'Brine', 1200, 6) && cardModel(state, KESTREL).reachable,
  cardModel(state, KESTREL).top);
const next = inReach[inReach.indexOf(KESTREL) + 1] ?? inReach[0]!;
check('…a ship out of reach cannot be picked; ← → step through the ships in reach', !selectShip(store, FAR) && cycleShip(store, 1) === next && cycleShip(store, -1) === KESTREL);
check('…SET COURSE to a ship out of reach throws', throws(() => setCourseFromDesk(store, FAR)) && store.getState().run.phase === 'desk');
setCourseFromDesk(store, KESTREL);
state = store.getState();
const plan = state.run.transit!;
const hop = hopBetween(state.run.map, HALCYON, KESTREL);
check('SET COURSE ▸ KESTREL: the PACKET against the hop (4 hits, 26 LY, 3 fixed by ECC while asleep)',
  state.run.phase === 'transmit' && plan.toSlot === KESTREL && plan.toShipIndex === 2
  && plan.hop.transitHits === 4 && plan.hop.distanceLy === 26 && plan.hop.eccFixes === 3 && plan.extraHits === 0, JSON.stringify(plan.hop));
check('…the hop is the one hopBetween gives', JSON.stringify(plan.hop) === JSON.stringify(hop));
backToChart(store);
state = store.getState();
check('◀ CHART: back on the desk, the packet forgotten, KESTREL still selected', state.run.phase === 'desk' && state.run.transit === null && state.ui.deskSelected === KESTREL);
check('…◀ CHART off the PACKET throws', throws(() => backToChart(store)));

const lost = halcyonOver();
openDesk(lost, { extraHits: 3, coreHit: 25, coreReset: false });
check('a lost ship\'s extras wait on the map for the hop the kid picks', lost.getState().run.map.pendingExtra?.extraHits === 3);
setCourseFromDesk(lost, KESTREL);
backToChart(lost);
setCourseFromDesk(lost, KESTREL);
check('…and survive ◀ CHART: the PACKET carries +3 hits and the Core\'s −25', lost.getState().run.transit?.extraHits === 3 && lost.getState().run.transit?.coreHit === 25);

const final = createStore<GameState>(createInitialState({ seed: 4, shipIndex: 4, carried: 'fresh' }));
final.update((draft) => { draft.run.phase = 'report'; });
endShip(final, 'locked');
check('the final ship has no desk and no next ship', throws(() => openDesk(final, null)) && throws(() => goTransmit(final, 18)));
const early = createStore<GameState>(createInitialState({ seed: 4, shipIndex: 1, carried: 'fresh' }));
check('a ship that has not ended has no desk', throws(() => openDesk(early, null)));
finish();
