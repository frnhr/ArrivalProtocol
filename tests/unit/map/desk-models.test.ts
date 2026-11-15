// Slice 3a DESK: the DESK's models on run 1's arm (systems/desk.ts; 02-map §2, §4; slice-3a-plan §3, §6.1), pure, with the
// state built directly (the arm's shipDefOf is Track GEN's, and the models never build a ship): the STAR CHART's node
// states and reasons (6 in reach from ARES-VII, ALBATROSS ONLY FROM HERE, TOO LATE, OUT OF RANGE, past, visited, urgent),
// the card rows for HALCYON, ALBATROSS, VESPER from KESTREL, LAPWING (TIGHT), a final ship with no rm and CORMORANT's
// boarding beam (M3), the TIMELINE, the greying beat (`2 SHIPS NOW OUT OF YOUR REACH` at KESTREL), the steps and ← →.
// Slice 3b (Track UI): the first desk's file step, the DELIVERIES row and TIMELINE marks (in time, late, catching up), the
// request toggle, the tab and its badge.
// Playtest 1 (B-DESK, §3.6): one REPOSITORY with two halves; 'training' is the alias for its COMPILE HERE half (it lights the
// REPOSITORY tab), and handing the keys to FROM EARTH disarms a picked cell.
import { check, finish } from '../landing/checks';
import { createStore, type Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { RouteStop } from '@/types/map';
import { createInitialState } from '@state/initial';
import {
  chartModel, cardModel, deskSteps, deskOpeningBeat, deskCandidates, selectShip, cycleShip, onlyFromHere, deskControlLine,
  trail046, chartRings, toggleRequest, openDeskWindow, deskTabBadges, type CardModel,
} from '@systems/desk';
import { hopBetween } from '@systems/map-hop';
import { unitArrival } from '@systems/arrival-preview';
import { mapFacts } from '@systems/map-facts';
import { planThreat, threatInputFor, NO_FINAL_TRACES } from '@systems/threat-plan';
import { shipSummaryAt } from '@systems/map-run';
import { shipsLeft } from '@systems/map-route';
import { MAP_TEXT } from '@data/map-text';
import { COMPANION_LINES } from '@data/companion-text';
import { REPO_TEXT, REPO_FILE_TEXT } from '@data/repo-text';
import { recommendation } from '@systems/repository';
import { THREAT_TEXT } from '@data/threat-text';
import { run1Map } from './run1-fixture';
import { shipResultOf } from '@systems/run';
import { shownTab } from '@components/desk/DeskTabs';

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
check('…HALCYON reads SLEEP 31 YRS on hover; its label is `HALCYON · 1,000`', node(2).reason === 'SLEEP 31 YRS' && node(2).label === 'HALCYON · 1,000');
check('…046\'s written trail: WAYPOINT already a colony (2299 < 2300), MERIDIAN and TALLGRASS still ahead, a grey cross',
  trail046(state.run.map).map((m) => `${m.colony}:${m.passed}`).join() === 'WAYPOINT:true,MERIDIAN:false,TALLGRASS:false,null:false'
  && node(1).taken === MAP_TEXT.chart.trail046 && node(2).taken === null);
check('…rings: six, the next one out from ARES-VII (8 LY) is ring 1 at 20 LY', chartRings(state.run.map, 0).filter((r) => r.next).map((r) => r.n).join() === '1'
  && chart.rings.length === 6);
check('…no ship greyed on the first desk; PAL types its line (playtest 1: the companion\'s, CHIPPER on run 1)', deskOpeningBeat(state).greyed.length === 0 && deskOpeningBeat(state).line === null
  && deskControlLine(state) === COMPANION_LINES.chipper.deskHello(47));

const halcyon = cardModel(state, 2);
check('HALCYON\'s card leads with the colonists, the years early and the cost (the lead\'s call), then the fit line',
  halcyon.top === 'HALCYON · Tessaly · 1,000 COLONISTS · 5 PODS' && halcyon.sub === 'Tessaly · 5 PODS' && halcyon.colonists === '1,000 COLONISTS'
  && halcyon.schedule === 'YOU SLEEP 31 YRS IN ITS RECEIVER · ECC FIXES 1' && halcyon.cost === '3 HITS ON THE WAY → 2 LAND' && halcyon.rows[0]?.key === 'fit'
  && row(halcyon, 'problems') === 'FLYBY, TOO WIDE', JSON.stringify(halcyon));
check('…MEMORY 320 · COMPACT · ROOM FOR YOU 152, and the fit line from roomFit (YOU FIT for the fresh unit)',
  row(halcyon, 'memory') === 'MEMORY 320 · COMPACT · ROOM FOR YOU 152' && row(halcyon, 'fit') === 'YOU FIT' && halcyon.fit?.word === 'fits', row(halcyon, 'fit'));
check('…the planet with its off-site words and the LZ count (Tessaly: GRASSLAND, GENTLE), SET BY ARRIVAL CONTROL',
  row(halcyon, 'planet') === 'GRASSLAND · off-site pods score half'
  && row(halcyon, 'lzs') === MAP_TEXT.card.lzs(shipSummaryAt(state.run.map, 2).lzCount, 'good'), `${row(halcyon, 'planet')} ${row(halcyon, 'lzs')}`);
check('…BEAM `21 LY`, `NOISE CLEAN · SEEDS: none` (depth 2)',
  row(halcyon, 'beam') === '21 LY' && row(halcyon, 'noise') === 'NOISE CLEAN · SEEDS: none');
// 3–6: HALCYON → a layer-4 ship → a layer-6 ship → LAST LIGHT is a route of 5 (plan §3's sample says 4–6).
check('…`YOUR 2ND SHIP · 3–6 MORE TO THE FINAL SHIP` (shipsLeft), no HOLLOW line, no NO RM',
  row(halcyon, 'run') === 'YOUR 2ND SHIP · 3–6 MORE TO THE FINAL SHIP' && shipsLeft(state.run.map, 2).join() === '3,6'
  && row(halcyon, 'threat') === undefined && row(halcyon, 'norm') === undefined, row(halcyon, 'run'));
check('…the TIMELINE `2300 you leave · 2321 you get there · 2352 ▲ approach`',
  halcyon.timeline?.text === '2300 you leave · 2321 you get there · 2352 ▲ approach' && !halcyon.timeline.late);

const albatross = cardModel(state, 6);
check('ALBATROSS: ARK, 3,000 COLONISTS, SLEEP 14 YRS, 51 LY · 7 HITS, ONLY FROM HERE in red',
  albatross.tags.includes('ARK') && albatross.colonists === '3,000 COLONISTS' && albatross.schedule === 'YOU SLEEP 14 YRS IN ITS RECEIVER · ECC FIXES 0'
  && row(albatross, 'beam') === '51 LY' && (albatross.cost ?? '').startsWith('7 HITS') && albatross.rows.find((r) => r.key === 'only')?.tone === 'warn',
  JSON.stringify(albatross.rows));
const far = cardModel(state, 8);
check('an OUT OF RANGE ship\'s card has no BEAM row, only the range (Hop.inRange), and no fit line or cost (the nit)',
  row(far, 'beam') === undefined && row(far, 'range') === MAP_TEXT.chart.outOfRange(70) && !far.reachable
  && row(far, 'fit') === undefined && far.fit === null && far.cost === null);

// Picking and cycling.
// 3b: the run's first desk has three steps (02 §4: ship → file → SET COURSE); the file step only guides. Slice 4 prepends
// the required first skill (A SKILL); its done-ness is skills/ui-models'. The first desk is visit 1 (skill-tree.ts
// isFirstDesk: one ship ended, the review's m14), so this crafted desk records ARES-VII's result first.
ares.update((draft) => { draft.run.ships = [shipResultOf(draft, 'locked', 0)]; });
state = ares.getState();
const firstSteps = deskSteps(state);
const stepOf = (steps: ReturnType<typeof deskSteps>, id: string) => steps.find((step) => step.id === id)!;
check('steps: a skill, a ship, a file, SET COURSE (the first desk); pick a ship first, SET COURSE ▸ … not yet',
  firstSteps.map((step) => step.id).join() === 'train,pick-ship,request,set-course' && !stepOf(firstSteps, 'pick-ship').done
  && !stepOf(firstSteps, 'request').done && stepOf(firstSteps, 'set-course').text === MAP_TEXT.desk.setCourse('…')
  && firstSteps.map((step) => step.label).join() === 'A SKILL,A SHIP,A FILE,SET COURSE');
const recommendedNow = recommendation(state);
check('…the file step names CONTROL\'s recommendation (`REQUEST mv · RECOMMENDED [R]`), or any file while it has none',
  stepOf(firstSteps, 'request').text === (recommendedNow === null ? REPO_TEXT.desk.requestAny : REPO_TEXT.desk.request(REPO_FILE_TEXT[recommendedNow].boot)),
  stepOf(firstSteps, 'request').text);
check('a TOO LATE or OUT OF RANGE click is refused', !selectShip(ares, 8) && ares.getState().ui.deskSelected === null);
check('← → cycle the six in slot order, wrapping', cycleShip(ares, 1) === 1 && cycleShip(ares, 1) === 2 && cycleShip(ares, -1) === 1 && cycleShip(ares, -1) === 6);
selectShip(ares, 2);
state = ares.getState();
check('…a pick moves the strip on (the file step, then `SET COURSE ▸ HALCYON [ENTER]`)', stepOf(deskSteps(state), 'pick-ship').done
  && stepOf(deskSteps(state), 'set-course').text === 'SET COURSE ▸ HALCYON [ENTER]' && chartModel(state).selected === 2);

// 3b: a request on the first desk (Mv to HALCYON: in time, 2337 before the 2352 approach), from the one outlook rule.
check('no request yet: HALCYON\'s card has no DELIVERIES row and no TIMELINE marks',
  row(cardModel(state, 2), 'deliveries') === undefined && cardModel(state, 2).timeline?.marks.length === 0);
check('toggleRequest(mv) requests it; the file step is done and says `mv REQUESTED`',
  toggleRequest(ares, 'mv') === 'mv' && stepOf(deskSteps(ares.getState()), 'request').done && stepOf(deskSteps(ares.getState()), 'request').text === 'mv REQUESTED');
state = ares.getState();
const mvCard = cardModel(state, 2);
check('HALCYON: `DELIVERIES · Mv ✓ WAITING HERE` in green, TIMELINE mark `2337 Mv` before ▲ (green)',
  row(mvCard, 'deliveries') === 'Mv ✓ WAITING HERE' && mvCard.rows.find((r) => r.key === 'deliveries')?.tone === 'good'
  && mvCard.timeline?.marks.length === 1 && mvCard.timeline.marks[0]!.text === '2337 Mv' && !mvCard.timeline.marks[0]!.late,
  JSON.stringify(mvCard.timeline?.marks));
check('…the REPOSITORY badge names the request', deskTabBadges(state).repository === 'Mv');
check('…a second toggle clears it (one request, changeable until TRANSMIT ▸)', toggleRequest(ares, 'mv') === null && ares.getState().run.repo.pick === null);
openDeskWindow(ares, 'repository');
check('openDeskWindow: the REPOSITORY tab, then back to the card (null)', ares.getState().ui.deskWindow === 'repository'
  && (openDeskWindow(ares, null), ares.getState().ui.deskWindow === null));
check('playtest 1: the tabs are CARD / REPOSITORY / INBOX; \'training\' (COMPILE HERE, [T]) lights the REPOSITORY',
  shownTab(null) === 'card' && shownTab('repository') === 'repository' && shownTab('training') === 'repository' && shownTab('inbox') === 'inbox');
openDeskWindow(ares, 'training');
ares.update((draft) => { draft.ui.trainingArmed = true; });
openDeskWindow(ares, 'repository');
check('…COMPILE HERE with a cell armed, then FROM EARTH: the keys move up and the cell is disarmed (ENTER sets course again)',
  ares.getState().ui.deskWindow === 'repository' && !ares.getState().ui.trainingArmed);
openDeskWindow(ares, null);

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
check('VESPER from KESTREL: ARK, ENGINE FAULT, MEMORY 384 · FULL, 55 LY, 8 HITS · 4 FIXED, SEEDS from depth 4',
  vesper.tags.includes('ARK') && row(vesper, 'problems') === 'ENGINE FAULT' && row(vesper, 'memory') === 'MEMORY 384 · FULL · ROOM FOR YOU 152'
  && row(vesper, 'beam') === '55 LY' && vesper.cost === '8 HITS ON THE WAY → 4 LAND'
  && /^NOISE CLEAN · SEEDS 0$/.test(row(vesper, 'noise') ?? '')
  && vesper.schedule === 'YOU SLEEP 103 YRS IN ITS RECEIVER · ECC FIXES 4' && vesper.timeline?.text === '2467 you leave · 2522 you get there · 2625 ▲ approach', JSON.stringify(vesper.rows));
check('VESPER is ONLY FROM HERE at KESTREL (the layer-4 ships would be too late for the ark)', row(vesper, 'only') !== undefined);
check('3b: later desks have no file step', deskSteps(state).map((step) => step.id).join() === 'pick-ship,set-course');
// 3b: Swap asked for at KESTREL is 4 years late at VESPER (2629 > 2625): the card says so in red, the mark after ▲.
toggleRequest(kestrel, 'swap');
const lateSwap = cardModel(kestrel.getState(), 11);
check('VESPER with Swap requested: `DELIVERIES · Swap ✗ 4 YRS LATE` in red, TIMELINE `2629 Swap` after ▲ (red)',
  row(lateSwap, 'deliveries') === 'Swap ✗ 4 YRS LATE' && lateSwap.rows.find((r) => r.key === 'deliveries')?.tone === 'warn'
  && lateSwap.timeline?.marks[0]?.text === '2629 Swap' && lateSwap.timeline.marks[0].late === true, JSON.stringify(lateSwap.timeline?.marks));
toggleRequest(kestrel, 'swap');
state = kestrel.getState();
const lapwing = cardModel(state, 8);
const lapFit = lapwing.fit!;
check('LAPWING (TIGHT): MEMORY 256 · TIGHT · ROOM FOR YOU 88, the fit line is roomFit\'s words for this unit',
  row(lapwing, 'memory') === 'MEMORY 256 · TIGHT · ROOM FOR YOU 88' && row(lapwing, 'fit') === MAP_TEXT.card.fit(lapFit)
  && lapFit.room === 88 && lapFit.floor === 0, `${row(lapwing, 'fit')} ${JSON.stringify(lapFit)}`);
// The review's m6: one preview. The card's fit is unitArrival's for the unit as it is (no drop, no pick), with the
// ladder's verdict for the beam: the PACKET's own function.
const lapVerdict = planThreat(threatInputFor(state.run.threat, mapFacts(state.run.map, 5, 8, 4), false, NO_FINAL_TRACES));
check('…the fit is the PACKET\'s rule: unitArrival of the unit as it is against the hop, with the verdict\'s seeds',
  JSON.stringify(lapFit) === JSON.stringify(unitArrival(state, { hop: hopBetween(state.run.map, 5, 8), threat: lapVerdict, dropped: [], pick: null, deliveries: [] }).fit));

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
check('VESPER\'s desk: CORMORANT says ??? WILL FIND YOU ON THIS BEAM (M3; playtest 1: not HOLLOW, which it has not said yet)',
  row(cormorant, 'threat') === '??? WILL FIND YOU ON THIS BEAM' && row(cormorant, 'threat') === THREAT_TEXT.willFindYou('???'), JSON.stringify(cormorant.rows));
check('…KITTIWAKE (Kettle is 59 LY from New Haven: no M3) has no HOLLOW line; CORMORANT is not ONLY FROM HERE',
  row(cardModel(state, 14), 'threat') === undefined && row(cormorant, 'only') === undefined);
// 3b: Swap in transit, 4 years behind the unit at VESPER: it catches up at CORMORANT (4 − 162), its receiver in 2659.
atVesper.update((draft) => {
  draft.run.repo.requests = [{
    id: 'rq3', file: 'swap', fromSlot: 5, toSlot: 11, requestedYear: 2467, lateness: 4, status: 'in-transit', at: null, arrivedYear: null,
  }];
});
const catchUp = cardModel(atVesper.getState(), 15);
check('Swap in transit: CORMORANT says `Swap ✓ CATCHES UP HERE`, TIMELINE `2659 Swap` before ▲',
  row(catchUp, 'deliveries') === 'Swap ✓ CATCHES UP HERE' && catchUp.timeline?.marks[0]?.text === '2659 Swap' && !catchUp.timeline.marks[0].late,
  `${row(catchUp, 'deliveries')} ${JSON.stringify(catchUp.timeline?.marks)}`);

// --- CORMORANT's desk: LAST LIGHT with no rm aboard -------------------------------------------------------------------------
const atCormorant = deskAt([0, 2, 5, 11, 15]);
state = atCormorant.getState();
const last = cardModel(state, 19);
check('LAST LIGHT from CORMORANT: FINAL SHIP, `NO RM · YOU CAN\'T DELETE THE ROOT` in red (no DELETE aboard), THE LAST',
  last.tags.includes('FINAL SHIP') && last.rows.find((r) => r.key === 'norm')?.value === THREAT_TEXT.noRmPacket
  && last.rows.find((r) => r.key === 'norm')?.tone === 'warn' && row(last, 'run') === MAP_TEXT.card.lastOfRun(6), JSON.stringify(last.rows));
check('…54 LY, 8 HITS → 3 LAND, SLEEP 149 YRS · ECC FIXES 5', row(last, 'beam') === '54 LY'
  && last.cost === '8 HITS ON THE WAY → 3 LAND' && last.schedule === 'YOU SLEEP 149 YRS IN ITS RECEIVER · ECC FIXES 5');
const goodHope = cardModel(state, 17);
check('…GOOD HOPE is TOO LATE BY 15 YRS from CORMORANT (card and chart), with no fit line (the nit)', goodHope.schedule === 'TOO LATE BY 15 YRS'
  && chartModel(state).nodes.find((n) => n.slot === 17)?.state === 'too-late' && row(goodHope, 'fit') === undefined && goodHope.cost === null);

finish();
