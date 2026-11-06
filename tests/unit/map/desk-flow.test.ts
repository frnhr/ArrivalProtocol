// Slice 3a F2: the DESK in the run's flow (systems/run.ts openDesk, setCourse, backToChart, goTransmit(store, toSlot);
// systems/desk.ts), headless on the classic world, whose desk offers the single next ship: a ship's end opens the desk
// with both clocks stopped, SET COURSE builds the PACKET against the hop, ◀ CHART goes back and keeps a lost ship's extras,
// an unreachable slot throws, and the debug hooks' shapes are there.
import { check, finish } from '../landing/checks';
import { createStore, type Store } from '@state/store';
import type { GameState } from '@state/schema';
import { createInitialState } from '@state/initial';
import { freshUnitRacks } from '@systems/carry';
import { classicShip, CLASSIC_HOPS } from '@data/classic-five';
import { endShip, openDesk, backToChart, goTransmit } from '@systems/run';
import { setCourseFromDesk } from '../support/desk';
import { deskCandidates, deskSteps, selectShip, cycleShip, cardModel } from '@systems/desk';
import { hopBetween } from '@systems/map-hop';
import { MAP_TEXT } from '@data/map-text';

function halcyonOver(): Store<GameState> {
  const store = createStore<GameState>(createInitialState({ seed: 4, shipIndex: 1, carried: freshUnitRacks(classicShip(1)) }));
  store.update((draft) => { draft.run.phase = 'report'; });
  endShip(store, 'locked');
  return store;
}
const throws = (fn: () => void): boolean => { try { fn(); return false; } catch { return true; } };

const store = halcyonOver();
openDesk(store, null);
let state = store.getState();
check('a ship\'s end opens the DESK: both clocks stopped, the classic desk offers KESTREL alone, already selected',
  state.run.phase === 'desk' && state.clock.paused && deskCandidates(state).join() === '2' && state.ui.deskSelected === 2 && state.run.map.pendingExtra === null);
check('…its steps: the ship is picked, SET COURSE ▸ KESTREL [ENTER] is next',
  deskSteps(state)[0]!.done && deskSteps(state)[1]!.text === MAP_TEXT.desk.setCourse('KESTREL'));
check('…the card names the ship (top line)', cardModel(state, 2).top === MAP_TEXT.card.top('KESTREL', 'Brine', 2400, 12) && cardModel(state, 2).reachable);
check('…a ship out of reach cannot be picked; ← → stay on the one ship', !selectShip(store, 3) && cycleShip(store, 1) === 2 && cycleShip(store, -1) === 2);
check('…SET COURSE to a ship out of reach throws', throws(() => setCourseFromDesk(store, 3)) && store.getState().run.phase === 'desk');
setCourseFromDesk(store, 2);
state = store.getState();
const plan = state.run.transit!;
check('SET COURSE ▸ KESTREL: the PACKET against the hop (link 112, 4 hits, 27 LY, no ECC on the classic world)',
  state.run.phase === 'transmit' && plan.toSlot === 2 && plan.toShipIndex === 2 && plan.linkBlocks === CLASSIC_HOPS[2]!.linkBlocks
  && plan.hop.transitHits === 4 && plan.hop.distanceLy === 27 && plan.hop.eccFixes === 0 && plan.extraHits === 0, JSON.stringify(plan.hop));
check('…the classic hop is the one hopBetween gives', JSON.stringify(plan.hop) === JSON.stringify(hopBetween(state.run.map, 1, 2)));
backToChart(store);
state = store.getState();
check('◀ CHART: back on the desk, the packet forgotten, KESTREL still selected', state.run.phase === 'desk' && state.run.transit === null && state.ui.deskSelected === 2);
check('…◀ CHART off the PACKET throws', throws(() => backToChart(store)));

const lost = halcyonOver();
openDesk(lost, { extraHits: 3, coreHit: 25, coreReset: false });
check('a lost ship\'s extras wait on the map for the hop the kid picks', lost.getState().run.map.pendingExtra?.extraHits === 3);
setCourseFromDesk(lost, 2);
backToChart(lost);
setCourseFromDesk(lost, 2);
check('…and survive ◀ CHART: the PACKET carries +3 hits and the Core\'s −25', lost.getState().run.transit?.extraHits === 3 && lost.getState().run.transit?.coreHit === 25);

const final = createStore<GameState>(createInitialState({ seed: 4, shipIndex: 4, carried: freshUnitRacks(classicShip(4)) }));
final.update((draft) => { draft.run.phase = 'report'; });
endShip(final, 'locked');
check('the final ship has no desk and no next ship', throws(() => openDesk(final, null)) && throws(() => goTransmit(final, 5)));
const early = createStore<GameState>(createInitialState({ seed: 4, shipIndex: 1, carried: freshUnitRacks(classicShip(1)) }));
check('a ship that has not ended has no desk', throws(() => openDesk(early, null)));
finish();
