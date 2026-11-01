// Slice 3a DESK: the DESK's models on run 1's arm (systems/desk.ts; 02-map §2, §4; slice-3a-plan §3, §6.1), pure, with the
// state built directly (the arm's shipDefOf is Track GEN's, and the models never build a ship): the STAR CHART's node
// states and reasons (6 in reach from ARES-VII, ALBATROSS ONLY FROM HERE, TOO LATE, OUT OF RANGE, past, visited, urgent),
// the card rows for HALCYON, ALBATROSS, VESPER from KESTREL, LAPWING (TIGHT), a final ship with no rm and CORMORANT's
// boarding beam (M3), the TIMELINE, the greying beat (`2 SHIPS NOW OUT OF YOUR REACH` at KESTREL), the steps and ← →.
import { check, finish } from '../landing/checks';
import { createStore, type Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { RouteStop } from '@/types/map';
import { createInitialState } from '@state/initial';
import {
  chartModel, cardModel, deskSteps, deskOpeningBeat, deskCandidates, selectShip, cycleShip, onlyFromHere, deskControlLine,
  trail046, chartRings, deskUnitLoad, type CardModel,
} from '@systems/desk';
import { hopBetween, roomFit } from '@systems/map-hop';
import { shipSummaryAt } from '@systems/map-run';
import { shipsLeft } from '@systems/map-route';
import { freshUnitRacks } from '@systems/carry';
import { classicShip } from '@data/classic-five';
import { MAP_TEXT } from '@data/map-text';
import { THREAT_TEXT } from '@data/threat-text';
import { run1Map } from './run1-fixture';

// The unit on run 1's arm at the end of `route` (slots, ARES-VII first), on the DESK.
function deskAt(route: readonly number[]): Store<GameState> {
  const store = createStore<GameState>(createInitialState({ seed: 4, shipIndex: 0, phase: 'desk' }));
  const map = run1Map(4);
  const stops: RouteStop[] = route.map((slot, i) => ({ slot, depth: i + 1, hop: i === 0 ? null : hopBetween({ ...map, galaxyYear: 0 }, route[i - 1]!, slot) }));
  map.route = stops;
  map.galaxyYear = map.arm[route[route.length - 1]!]!.approachYear;
  store.update((draft) => {
    draft.run.map = map;
    draft.run.shipIndex = route.length - 1;
    draft.run.phase = 'desk';
    draft.ui.deskSelected = null;
  });
  return store;
}
const row = (card: CardModel, key: string): string | undefined => card.rows.find((r) => r.key === key)?.value;

// --- The first desk: ARES-VII, 2300 -------------------------------------------------------------------------------------
const ares = deskAt([0]);
let state = ares.getState();
const chart = chartModel(state);
const node = (slot: number) => chart.nodes.find((n) => n.slot === slot)!;
check('first desk: 6 ships in reach from ARES-VII, one beam each', deskCandidates(state).length === 6 && chart.lines.length === 6,
  deskCandidates(state).join());
check('…the chart has every ship of the arm, ARES-VII current, LAST LIGHT the final beacon',
  chart.nodes.length === 20 && node(0).state === 'current' && node(19).isFinal && !node(18).isFinal);
check('…ALBATROSS (the ark) is ONLY FROM HERE, and nothing else is', onlyFromHere(state.run.map, 0).join() === '6' && node(6).onlyFromHere && node(6).kind === 'ark');
check('…light ships carry the TIGHT notch (PETREL), HALCYON does not', node(1).tight && !node(2).tight);
check('…layer-4 ships are OUT OF RANGE with the distance', node(8).state === 'out-of-range' && node(8).reason === MAP_TEXT.chart.outOfRange(70),
  `${node(8).state} ${node(8).reason}`);
check('…HALCYON reads 31 YRS EARLY on hover; its label is `HALCYON · 1,000`', node(2).reason === MAP_TEXT.chart.early(31) && node(2).label === 'HALCYON · 1,000');
check('…046\'s written trail: WAYPOINT already a colony (2299 < 2300), MERIDIAN and TALLGRASS still ahead, a grey cross',
  trail046(state.run.map).map((m) => `${m.colony}:${m.passed}`).join() === 'WAYPOINT:true,MERIDIAN:false,TALLGRASS:false,null:false'
  && node(1).taken046 && !node(2).taken046);
check('…rings: six, the next one out from ARES-VII (8 LY) is ring 1 at 20 LY', chartRings(state.run.map, 0).filter((r) => r.next).map((r) => r.n).join() === '1'
  && chart.rings.length === 6);
check('…no ship greyed on the first desk; CONTROL types its line', deskOpeningBeat(state).greyed.length === 0 && deskOpeningBeat(state).line === null
  && deskControlLine(state) === MAP_TEXT.desk.controlPick(47));

const halcyon = cardModel(state, 2);
check('HALCYON\'s card: top line, schedule, problems', halcyon.top === 'HALCYON · Tessaly · 1,000 COLONISTS · 5 PODS'
  && halcyon.schedule === 'APPROACH 2352 · YOU GET THERE 2321 · 31 YRS EARLY' && row(halcyon, 'problems') === 'FLYBY, TOO WIDE', JSON.stringify(halcyon));
check('…MEMORY 320 · COMPACT · ROOM FOR YOU 152, and the fit line from roomFit (YOU FIT for the fresh unit)',
  row(halcyon, 'memory') === 'MEMORY 320 · COMPACT · ROOM FOR YOU 152' && row(halcyon, 'fit') === 'YOU FIT' && halcyon.fit?.word === 'fits', row(halcyon, 'fit'));
check('…the planet with its off-site words and the LZ count (Tessaly: GRASSLAND, GENTLE), SET BY ARRIVAL CONTROL',
  row(halcyon, 'planet') === 'GRASSLAND · off-site pods score half'
  && row(halcyon, 'lzs') === MAP_TEXT.card.lzs(shipSummaryAt(state.run.map, 2).lzCount), `${row(halcyon, 'planet')} ${row(halcyon, 'lzs')}`);
check('…BEAM `21 LY · LINK 123 · 3 HITS (ECC fixes 1)`, `NOISE CLEAN · SEEDS: none` (depth 2)',
  row(halcyon, 'beam') === '21 LY · LINK 123 · 3 HITS (ECC fixes 1)' && row(halcyon, 'noise') === 'NOISE CLEAN · SEEDS: none');
// 3–6: HALCYON → a layer-4 ship → a layer-6 ship → LAST LIGHT is a route of 5 (plan §3's sample says 4–6).
check('…`SHIP 2 OF YOUR RUN · 3–6 MORE TO THE FINAL SHIP` (shipsLeft), no HOLLOW line, no NO RM',
  row(halcyon, 'run') === 'SHIP 2 OF YOUR RUN · 3–6 MORE TO THE FINAL SHIP' && shipsLeft(state.run.map, 2).join() === '3,6'
  && row(halcyon, 'threat') === undefined && row(halcyon, 'norm') === undefined, row(halcyon, 'run'));
check('…the TIMELINE `2300 you leave · 2321 you get there · 2352 ▲ approach`',
  halcyon.timeline?.text === '2300 you leave · 2321 you get there · 2352 ▲ approach' && !halcyon.timeline.late);

const albatross = cardModel(state, 6);
check('ALBATROSS: ARK, 3,000 COLONISTS, 14 YRS EARLY, 51 LY · LINK 90 · 7 HITS, ONLY FROM HERE in red',
  albatross.tags.includes('ARK') && /3,000 COLONISTS/.test(albatross.top) && /14 YRS EARLY/.test(albatross.schedule ?? '')
  && (row(albatross, 'beam') ?? '').startsWith('51 LY · LINK 90 · 7 HITS') && albatross.rows.find((r) => r.key === 'only')?.tone === 'warn',
  JSON.stringify(albatross.rows));
const far = cardModel(state, 8);
check('an OUT OF RANGE ship\'s card has no BEAM row, only the range (Hop.inRange)', row(far, 'beam') === undefined && row(far, 'range') === MAP_TEXT.chart.outOfRange(70)
  && !far.reachable);

// Picking and cycling.
check('steps: pick a ship first, SET COURSE ▸ … not yet', !deskSteps(state)[0]!.done && deskSteps(state)[1]!.text === MAP_TEXT.desk.setCourse('…'));
check('a TOO LATE or OUT OF RANGE click is refused', !selectShip(ares, 8) && ares.getState().ui.deskSelected === null);
check('← → cycle the six in slot order, wrapping', cycleShip(ares, 1) === 1 && cycleShip(ares, 1) === 2 && cycleShip(ares, -1) === 1 && cycleShip(ares, -1) === 6);
selectShip(ares, 2);
state = ares.getState();
check('…a pick moves the strip on to `SET COURSE ▸ HALCYON [ENTER]`', deskSteps(state)[0]!.done && deskSteps(state)[1]!.text === 'SET COURSE ▸ HALCYON [ENTER]'
  && chartModel(state).selected === 2);

// --- KESTREL's desk, 2467 (route ARES-VII → HALCYON → KESTREL) ------------------------------------------------------------
const kestrel = deskAt([0, 2, 5]);
state = kestrel.getState();
const kchart = chartModel(state);
const knode = (slot: number) => kchart.nodes.find((n) => n.slot === slot)!;
const beat = deskOpeningBeat(state);
check('KESTREL\'s desk opens with `2 SHIPS NOW OUT OF YOUR REACH`: PETREL and ALBATROSS grey, in year order',
  beat.greyed.join() === '1,6' && beat.line === '2 SHIPS NOW OUT OF YOUR REACH' && deskControlLine(state) === null, beat.greyed.join());
check('…they are past, ARES-VII and HALCYON visited, the route trail is ARES-VII → HALCYON → KESTREL',
  knode(1).state === 'past' && knode(6).state === 'past' && knode(0).state === 'visited' && knode(2).state === 'visited' && kchart.route.join() === '0,2,5');
check('…OSPREY (2352) and HERON (layer 3, 2512: behind the beam) are not in reach', knode(3).state === 'past' && knode(4).state === 'out-of-range'
  && knode(4).reason === MAP_TEXT.chart.behind);
check('…the next ring out from Brine (55 LY) is ring 3 at 68 LY', kchart.rings.find((r) => r.next)?.n === 3);
const vesper = cardModel(state, 11);
check('VESPER from KESTREL: ARK, ENGINE FAULT, MEMORY 384 · FULL, 55 LY · LINK 86 · 8 HITS (ECC fixes 4), SEEDS from depth 4',
  vesper.tags.includes('ARK') && row(vesper, 'problems') === 'ENGINE FAULT' && row(vesper, 'memory') === 'MEMORY 384 · FULL · ROOM FOR YOU 152'
  && row(vesper, 'beam') === '55 LY · LINK 86 · 8 HITS (ECC fixes 4)' && /^NOISE CLEAN · SEEDS 0$/.test(row(vesper, 'noise') ?? '')
  && vesper.schedule === 'APPROACH 2625 · YOU GET THERE 2522 · 103 YRS EARLY', JSON.stringify(vesper.rows));
check('VESPER is ONLY FROM HERE at KESTREL (the layer-4 ships would be too late for the ark)', row(vesper, 'only') !== undefined);
const lapwing = cardModel(state, 8);
const lapFit = lapwing.fit!;
check('LAPWING (TIGHT): MEMORY 256 · TIGHT · ROOM FOR YOU 88, the fit line is roomFit\'s words for this unit',
  row(lapwing, 'memory') === 'MEMORY 256 · TIGHT · ROOM FOR YOU 88' && row(lapwing, 'fit') === MAP_TEXT.card.fit(lapFit)
  && lapFit.room === 88 && lapFit.floor === 0, `${row(lapwing, 'fit')} ${JSON.stringify(lapFit)}`);
check('…the fit is the PACKET\'s rule: roomFit of the unit as it is against the hop (no seeds on a CLEAN beam)',
  JSON.stringify(lapFit) === JSON.stringify(roomFit(deskUnitLoad(state, 0), hopBetween(state.run.map, 5, 8))));

// A heavy unit squeezed on TIGHT: the card says so before the PACKET does.
kestrel.update((draft) => {
  const charge = draft.memory.find((seg) => seg.type === 'redundancy');
  if (charge?.type === 'redundancy') charge.used = 40;
});
const squeezed = cardModel(kestrel.getState(), 8).fit!;
check('…with 40 charge held, LAPWING\'s 88 squeezes it: `CHARGE SQUEEZED: n ARRIVES`', squeezed.word === 'squeezed' && squeezed.roomLost > 0
  && row(cardModel(kestrel.getState(), 8), 'fit') === `CHARGE SQUEEZED: ${squeezed.chargeArrives} ARRIVES`, JSON.stringify(squeezed));

// --- VESPER's desk: CORMORANT's beam boards HOLLOW (M3: New Haven in range) ------------------------------------------------
const atVesper = deskAt([0, 2, 5, 11]);
state = atVesper.getState();
const cormorant = cardModel(state, 15);
check('VESPER\'s desk: CORMORANT says HOLLOW WILL FIND YOU ON THIS BEAM (M3)', row(cormorant, 'threat') === THREAT_TEXT.willFindYou, JSON.stringify(cormorant.rows));
check('…KITTIWAKE (Kettle is 59 LY from New Haven: no M3) has no HOLLOW line; CORMORANT is not ONLY FROM HERE',
  row(cardModel(state, 14), 'threat') === undefined && row(cormorant, 'only') === undefined);

// --- CORMORANT's desk: LAST LIGHT with no rm aboard -------------------------------------------------------------------------
const atCormorant = deskAt([0, 2, 5, 11, 15]);
state = atCormorant.getState();
const last = cardModel(state, 19);
check('LAST LIGHT from CORMORANT: FINAL SHIP, `NO RM · YOU CAN\'T DELETE THE ROOT` in red (no DELETE aboard), THE LAST',
  last.tags.includes('FINAL SHIP') && last.rows.find((r) => r.key === 'norm')?.value === THREAT_TEXT.noRmPacket
  && last.rows.find((r) => r.key === 'norm')?.tone === 'warn' && row(last, 'run') === MAP_TEXT.card.lastOfRun(6), JSON.stringify(last.rows));
check('…54 LY · LINK 87 · 8 HITS (ECC fixes 5), 149 YRS EARLY', row(last, 'beam') === '54 LY · LINK 87 · 8 HITS (ECC fixes 5)' && /149 YRS EARLY/.test(last.schedule ?? ''));
check('…GOOD HOPE is TOO LATE BY 15 YRS from CORMORANT (card and chart)', /TOO LATE BY 15 YRS/.test(cardModel(state, 17).schedule ?? '')
  && chartModel(state).nodes.find((n) => n.slot === 17)?.state === 'too-late');

// --- The classic world keeps its one desk (no years, nothing only from here) ------------------------------------------------
const classic = createStore<GameState>(createInitialState({ seed: 4, shipIndex: 1, phase: 'desk', carried: freshUnitRacks(classicShip(1)) }));
state = classic.getState();
const cc = cardModel(state, 2);
check('classic world: the card has no years, the chart has five ships, nothing greys', cc.schedule === null && cc.timeline === null
  && chartModel(state).nodes.length === 5 && deskOpeningBeat(state).greyed.length === 0 && onlyFromHere(state.run.map, 1).length === 0);
finish();
