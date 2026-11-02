import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { NoiseCloud, ShipKind, DeskWindowId, Hop, RoomFit, ShipSummary, RunMapState } from '@/types/map';
import type { LinkNoise } from '@/types/threat';
import { currentSlot, shipSummaryAt, worldSlotOf, isEndSlot } from '@systems/map-run';
import { hopBetween, reachable, reachableFrom, hitsLanding } from '@systems/map-hop';
import { layerOf, solLy } from '@systems/map-geometry';
import { seedAllowance } from '@systems/map-noise';
import { unitArrival } from '@systems/arrival-preview';
import { deliveriesForHop } from '@systems/repository';
import { playsTutorial } from '@systems/meta';
import { shipsLeft } from '@systems/map-route';
import { mapFacts } from '@systems/map-facts';
import { planThreat, threatInputFor } from '@systems/threat-plan';
import { noWorkingRm } from '@state/threat-selectors';
import { layoutFor } from '@data/memory';
import { WORLDS, RING_LY } from '@data/arm';
import { UNIT_046_TRAIL } from '@data/ship-names';
import { FORGIVENESS_TEXT } from '@data/landing-text';
import { THREAT_TEXT } from '@data/threat-text';
import { SHIP_OUTCOME_WORD } from '@data/script';
import { MAP_TEXT, MODIFIER_LABEL } from '@data/map-text';
import { URGENT_SLACK_YEARS, TRAIL_046_CROSS_PAST_LY, BEAM_OUT_BLACKOUT_SEC } from '@data/tuning';

export type { DeskWindowId };

// The DESK's models (02-map §3.10, §4; slice-3a-plan §2.1, §3, §5.2), pure in the state, and its UI actions (selectShip,
// cycleShip). The flow's actions (openDesk, setCourse, backToChart) are systems/run.ts's: the desk only says which ship
// and how it reads. It reads ships only through systems/map-run.ts shipSummaryAt and the hop (never a built ShipDef: an
// arm ship is built only when the unit arrives), so every row can be computed for a ship no unit has reached.
// • chartModel: the STAR CHART's nodes (with their state, label, year and hover reason), the beams from the ship being
//   left to every ship in reach, the noise clouds, the route trail, 046's written trail and grey cross, and the key
//   rings with the next one labelled. Shared by the desk, the title card's faint chart and the RUN TALLY's mini chart.
// • cardModel: the SHIP CARD for a ship, seen from the ship being left (the schedule, the Uplink rows, the TIMELINE).
// • deskSteps: the guidance strip's two steps; deskOpeningBeat: the ships greyed since the last desk.
// The RUN TALLY's model lives in run-end.ts.

// A node's state on the STAR CHART (02 §4).
export type ChartNodeState = 'current' | 'reachable' | 'urgent' | 'too-late' | 'out-of-range' | 'past' | 'visited';

export interface ChartNode {
  slot: number;
  name: string;
  world: string;
  x: number;                // LY from SOL
  y: number;
  kind: ShipKind;
  colonists: number;
  tight: boolean;           // the TIGHT notch
  isFinal: boolean;         // the pulsing FINAL SHIP beacon
  state: ChartNodeState;
  label: string;            // `NAME · colonists`
  year: number;             // the approach year, under the label
  reason: string | null;    // the hover reason (`TOO LATE BY 18 YRS`, `31 YRS EARLY`, `VISITED · ORBIT LOCKED`)
  onlyFromHere: boolean;    // in reach now and from no ship in reach after it (02 §2: ALBATROSS on the first desk)
  taken046: boolean;        // 046's written trail gets there first (run 1; until the galaxy year passes its year)
}

export interface ChartLine {
  from: number;
  to: number;
  noise: LinkNoise;         // solid when CLEAN, more hatched at LOW, NOISY, SEVERE
  urgent: boolean;
}

// 046's written trail on run 1 (05 §3.11): its colonies, where they are, and whether the galaxy year has passed them
// (then they read as colonies with their age); the grey cross where it was lost.
export interface Trail046Mark {
  slot: number;
  x: number;
  y: number;
  year: number;
  colony: string | null;    // null: the grey cross
  passed: boolean;
  label: string;
}

export interface ChartRing {
  n: number;                // ring 1 … 6
  ly: number;
  label: string;
  next: boolean;            // the next ring out from the ship being left: the only one labelled
}

export interface ChartModel {
  world: RunMapState['world'];
  galaxyYear: number;
  current: number;
  nodes: ChartNode[];
  lines: ChartLine[];
  clouds: NoiseCloud[];
  route: number[];          // the slots visited, in order (the bright trail)
  trail046: Trail046Mark[];
  rings: ChartRing[];
  selected: number | null;
}

// One row of the SHIP CARD (02 §4: KNOWN PROBLEMS, MEMORY and its fit line, PLANET, LZ, BEAM, DELIVERIES, SHIP n OF YOUR
// RUN …). 'resident' (slice 5), 'site' (slice 6) and 'history' (3c) are reserved: 3a never makes them. 'deliveries' is
// 3b's (`Swap ✗ 4 YRS LATE`, `✓ CATCHES UP HERE`; Track UI makes it).
export interface CardRow {
  key: 'problems' | 'resident' | 'memory' | 'fit' | 'planet' | 'site' | 'lzs' | 'nogo' | 'beam' | 'noise' | 'range'
    | 'deliveries' | 'threat' | 'norm' | 'only' | 'run' | 'history';
  label: string;
  value: string;
  tone: 'plain' | 'good' | 'warn';
}

// The TIMELINE strip (02 §4, 3a without deliveries): the three years on one line, and the text the strip reads.
export interface CardTimeline {
  leave: number;
  arrive: number;
  approach: number;
  late: boolean;
  text: string;
}

// The card leads with three things (the lead's call after the review): the colonists, the years early or late, and what
// the trip costs; then the fit line (rows[0], key 'fit'); the other rows follow, lighter.
export interface CardModel {
  slot: number;
  reachable: boolean;
  state: ChartNodeState;
  top: string;              // `HALCYON · Tessaly · 1,000 COLONISTS · 5 PODS` (the card's text in one line)
  name: string;
  sub: string;              // `Tessaly · 5 PODS`
  colonists: string;        // `1,000 COLONISTS`
  tags: string[];           // `ARK`, `FINAL SHIP`
  schedule: string | null;  // `31 YRS EARLY` / `TOO LATE BY 18 YRS` (null on the classic world: no years); the TIMELINE has the years
  scheduleTone: 'plain' | 'good' | 'warn';
  cost: string | null;      // `4 HITS · 3 FIXED WHILE YOU SLEEP → 1 LANDS` (ships in reach)
  rows: CardRow[];
  timeline: CardTimeline | null;
  fit: RoomFit | null;      // the unit as it is now against the ship's room (null on the ship being left)
}

// The guidance strip's steps on a desk (02 §4): a ship, then SET COURSE. 3b inserts the recommended file ('request', the
// first desk only; it guides, SET COURSE never waits for it: decision 19), slice 4 the required TRAINING pick first
// (slice-3a-plan §2.10).
export interface DeskStep {
  id: 'pick-ship' | 'request' | 'set-course';
  text: string;
  done: boolean;
}

// The opening beat (02 §4): the ships whose approach passed since the last desk, greying one by one.
export interface DeskOpeningBeat {
  greyed: number[];
  line: string | null;      // `2 SHIPS NOW OUT OF YOUR REACH`
}

// The ships the unit can beam to from here, in slot order (the arrows cycle them).
export function deskCandidates(state: Readonly<GameState>): number[] {
  return reachableFrom(state.run.map, currentSlot(state.run));
}

// The ship SET COURSE would go to: the selection, if the kid made one.
export function deskTarget(state: Readonly<GameState>): number | null {
  return state.ui.deskSelected;
}

// Every slot on the map, in slot order (the classic five, or the arm's ships).
function mapSlots(map: Readonly<RunMapState>): number[] {
  return map.world === 'classic' ? [0, 1, 2, 3, 4] : map.arm.map((ship) => ship.slot);
}

// The ship in `slot`'s approach year, as the map has it (the classic world's fixture years too).
function approachOf(map: Readonly<RunMapState>, slot: number): number {
  return shipSummaryAt(map, slot).approachYear;
}

// Ships in reach now that no ship in reach on the way to them can reach (02 §2: `ONLY FROM HERE: from any layer-2 ship
// you'd be TOO LATE`): a ship two layers out with ships in reach between, none of which can still get there in time.
// Skip it now and it is gone. A ship in the next layer has nothing between, so it is never flagged; the classic world
// has one route, so nothing is ever only from here.
export function onlyFromHere(map: Readonly<RunMapState>, from: number): number[] {
  if (map.world === 'classic') return [];
  const offered = reachableFrom(map, from);
  return offered.filter((target) => {
    const between = offered.filter((via) => layerOf(via) < layerOf(target));
    return between.length > 0 && !between.some((via) => reachable(map, via, target));
  });
}

// A node's state and its hover reason, seen from the ship being left at the galaxy year.
function nodeState(
  state: Readonly<GameState>, slot: number, from: number, offered: readonly number[],
): { state: ChartNodeState; reason: string | null; hop: Hop | null } {
  const map = state.run.map;
  if (slot === from) return { state: 'current', reason: MAP_TEXT.chart.here, hop: null };
  const visited = map.route.some((stop) => stop.slot === slot);
  if (visited) {
    const result = [...state.run.ships].reverse().find((ship) => ship.slot === slot);
    return { state: 'visited', reason: MAP_TEXT.chart.visited(result ? SHIP_OUTCOME_WORD[result.outcome] : MAP_TEXT.chart.flown), hop: null };
  }
  const summary = shipSummaryAt(map, slot);
  if (summary.approachYear <= map.galaxyYear) return { state: 'past', reason: MAP_TEXT.chart.past(summary.approachYear), hop: null };
  const outward = layerOf(worldSlotOf(map, slot)) > layerOf(worldSlotOf(map, from));
  // The classic world's ships ahead of the next one are not on any beam from here (one route): out of range.
  if (map.world === 'classic' && !offered.includes(slot)) {
    return { state: 'out-of-range', reason: MAP_TEXT.chart.notNext, hop: null };
  }
  const hop = hopBetween(map, from, slot);
  if (!outward) return { state: 'out-of-range', reason: MAP_TEXT.chart.behind, hop };
  if (!hop.inRange) return { state: 'out-of-range', reason: MAP_TEXT.chart.outOfRange(hop.distanceLy), hop };
  if (hop.slackYears < 0) return { state: 'too-late', reason: MAP_TEXT.chart.tooLate(-hop.slackYears), hop };
  if (map.world === 'arm' && hop.slackYears < URGENT_SLACK_YEARS) return { state: 'urgent', reason: MAP_TEXT.chart.urgent(hop.slackYears), hop };
  return { state: 'reachable', reason: map.world === 'arm' ? MAP_TEXT.chart.early(hop.slackYears) : null, hop };
}

function worldXY(map: Readonly<RunMapState>, slot: number): { x: number; y: number } {
  const world = WORLDS[worldSlotOf(map, slot)]!;
  return { x: world.x, y: world.y };
}

// 046's written trail (run 1 only; 3c's archive replaces it with the last unit's real one). The grey cross sits a few
// LY past its world, along the trail's last leg (05: `a grey cross past Calder`).
export function trail046(map: Readonly<RunMapState>): Trail046Mark[] {
  if (map.run !== 1) return [];
  return UNIT_046_TRAIL.map((mark, index): Trail046Mark => {
    const world = WORLDS[mark.slot]!;
    let { x, y } = world;
    if (mark.colony === null) {
      const prev = WORLDS[UNIT_046_TRAIL[index - 1]?.slot ?? mark.slot]!;
      const len = Math.hypot(world.x - prev.x, world.y - prev.y) || 1;
      x += ((world.x - prev.x) / len) * TRAIL_046_CROSS_PAST_LY;
      y += ((world.y - prev.y) / len) * TRAIL_046_CROSS_PAST_LY;
    }
    const passed = map.galaxyYear > mark.year;
    let label: string;
    if (mark.colony === null) label = MAP_TEXT.chart.lost046;
    else if (passed) label = MAP_TEXT.chart.colony(mark.colony, map.galaxyYear - mark.year, 'UNIT-046');
    else label = MAP_TEXT.chart.trail046;
    return { slot: mark.slot, x, y, year: mark.year, colony: mark.colony, passed, label };
  });
}

// The six key rings (05 §3.2), the next one out from the ship being left labelled.
export function chartRings(map: Readonly<RunMapState>, from: number): ChartRing[] {
  const here = solLy(worldSlotOf(map, from));
  const next = RING_LY.findIndex((ly) => ly > here);
  return RING_LY.map((ly, index) => ({ n: index + 1, ly, label: MAP_TEXT.chart.ring(index + 1, ly), next: index === next }));
}

export function chartModel(state: Readonly<GameState>): ChartModel {
  const map = state.run.map;
  const from = currentSlot(state.run);
  const offered = reachableFrom(map, from);
  const only = new Set(onlyFromHere(map, from));
  const trail = trail046(map);
  const nodes = mapSlots(map).map((slot): ChartNode => {
    const ship = shipSummaryAt(map, slot);
    const { x, y } = worldXY(map, slot);
    const seen = nodeState(state, slot, from, offered);
    return {
      slot, name: ship.name, world: ship.world, x, y, kind: ship.kind, colonists: ship.colonists,
      tight: ship.memoryClass === 'TIGHT', isFinal: ship.final, state: seen.state,
      label: MAP_TEXT.chart.node(ship.name, ship.colonists), year: ship.approachYear, reason: seen.reason,
      onlyFromHere: only.has(slot),
      taken046: map.world === 'arm' && trail.some((mark) => mark.colony !== null && mark.slot === worldSlotOf(map, slot) && !mark.passed),
    };
  });
  const lines = offered.map((to): ChartLine => {
    const hop = hopBetween(map, from, to);
    return { from, to, noise: hop.noise, urgent: map.world === 'arm' && hop.slackYears < URGENT_SLACK_YEARS };
  });
  return {
    world: map.world, galaxyYear: map.galaxyYear, current: from, nodes, lines, clouds: map.noise.map((cloud) => ({ ...cloud })),
    route: map.route.map((stop) => stop.slot), trail046: trail, rings: chartRings(map, from), selected: state.ui.deskSelected,
  };
}

// --- The SHIP CARD ------------------------------------------------------------------------------------------------------

// KNOWN PROBLEMS' labels: the template's own arrival and the extra modifiers (02 §3.5); DEBRIS names its rack when the
// arm stored it.
export function problemLabels(ship: Readonly<ShipSummary>): string[] {
  return ship.modifiers.map((id) => (id === 'debris' && ship.debrisRack !== null ? MAP_TEXT.card.debris(ship.debrisRack) : MODIFIER_LABEL[id]));
}

function fitTone(fit: Readonly<RoomFit>): CardRow['tone'] {
  if (fit.word !== 'fits' || fit.chargeArrivesMin < fit.chargeArrives) return 'warn';
  return fit.linkLost > 0 ? 'plain' : 'good';
}

export function cardModel(state: Readonly<GameState>, slot: number): CardModel {
  const map = state.run.map;
  const from = currentSlot(state.run);
  const ship = shipSummaryAt(map, slot);
  const offered = reachableFrom(map, from);
  const seen = nodeState(state, slot, from, offered);
  const isReachable = offered.includes(slot);
  const arm = map.world === 'arm';
  const tags = [...(ship.kind === 'ark' ? [MAP_TEXT.card.ark] : []), ...(ship.final ? [MAP_TEXT.card.finalShip] : [])];
  const rows: CardRow[] = [];
  const row = (key: CardRow['key'], label: string, value: string, tone: CardRow['tone'] = 'plain'): void => {
    rows.push({ key, label, value, tone });
  };
  const layout = layoutFor(ship.memoryClass);
  const depth = map.route.length + 1;

  // The hop (the beam from the ship being left), for every ship but that one: the card shows TOO LATE and OUT OF RANGE
  // ships too, and prints the beam only when it is in range (Hop.inRange).
  const hop = slot === from ? null : (seen.hop ?? (map.world === 'classic' && !isReachable ? null : hopBetween(map, from, slot)));
  // The ladder's verdict for this beam, from the run's threat with this ship's tally done: HOLLOW's line and the seeds the
  // beam may bring (the PACKET's own rule: systems/map-noise.ts seedAllowance), for any beam in range.
  const verdict = hop !== null && (isReachable || (arm && hop.inRange))
    ? planThreat(threatInputFor(state.run.threat, mapFacts(map, from, slot, depth), state.run.stats.deal !== null))
    : null;
  // The fit line only for a ship SET COURSE can go to (an out-of-range or TOO LATE hop has no packet to fit).
  let fit: RoomFit | null = null;
  if (hop !== null && verdict !== null && isReachable) {
    // The fit line counts the deliveries that would ride that hop (phase 3 slice 3b, plan §1.1 item 13).
    const preview = unitArrival(state, { hop, threat: verdict, dropped: [], pick: null, deliveries: deliveriesForHop(state, from, slot, verdict) });
    fit = preview.fit;
    row('fit', MAP_TEXT.card.fitLabel, preview.card, fitTone(fit));
  }
  row('problems', MAP_TEXT.card.problemsLabel, MAP_TEXT.card.problems(problemLabels(ship)), ship.modifiers.length > 0 ? 'warn' : 'plain');
  row('memory', MAP_TEXT.card.memoryLabel, MAP_TEXT.card.memory(layout.totalBlocks, ship.memoryClass, layout.roomForUnit));

  row('planet', MAP_TEXT.card.planetLabel, MAP_TEXT.card.planet(ship.terrain, FORGIVENESS_TEXT[ship.forgiveness].offSite));
  if (ship.noGoWords.length > 0) row('nogo', MAP_TEXT.card.noGoLabel, MAP_TEXT.card.noGo(ship.noGoWords), 'warn');
  row('lzs', MAP_TEXT.card.lzLabel, MAP_TEXT.card.lzs(ship.lzCount));

  if (hop !== null && hop.inRange) {
    const seeds = verdict === null ? null : seedAllowance(verdict, playsTutorial(state.run));
    row('beam', MAP_TEXT.card.beamLabel, MAP_TEXT.card.beam(hop.distanceLy, hop.linkBlocks));
    row('noise', '', MAP_TEXT.card.noise(hop.noise, MAP_TEXT.card.seeds(seeds)), hop.noise > 0 ? 'warn' : 'plain');
  } else if (hop !== null) {
    row('range', MAP_TEXT.card.beamLabel, MAP_TEXT.chart.outOfRange(hop.distanceLy), 'warn');
  }

  // HOLLOW boarding on this beam is said before SET COURSE (04 §3.8; slice-3a-plan §1.1 item 14): the ladder's verdict
  // for this candidate, from the run's threat with this ship's tally done.
  if (isReachable && verdict !== null && verdict.boards !== null) {
    row('threat', MAP_TEXT.card.threatLabel, THREAT_TEXT.willFindYou, 'warn');
  }
  if (ship.final && noWorkingRm(state)) row('norm', MAP_TEXT.card.threatLabel, THREAT_TEXT.noRmPacket, 'warn');
  if (isReachable && onlyFromHere(map, from).includes(slot)) row('only', '', MAP_TEXT.card.onlyFromHere, 'warn');

  if (isReachable || slot === from) {
    const [min, max] = shipsLeft(map, slot);
    const at = slot === from ? map.route.length : depth;
    row('run', '', isEndSlot(map, slot) ? MAP_TEXT.card.lastOfRun(at) : MAP_TEXT.card.shipOfRun(at, min, max));
  }

  let schedule: string | null = null;
  let scheduleTone: CardModel['scheduleTone'] = 'plain';
  let timeline: CardTimeline | null = null;
  if (arm && hop !== null) {
    const late = hop.slackYears < 0;
    schedule = late ? MAP_TEXT.card.late(-hop.slackYears) : MAP_TEXT.card.early(hop.slackYears);
    scheduleTone = late ? 'warn' : hop.slackYears < URGENT_SLACK_YEARS ? 'warn' : 'good';
    timeline = {
      leave: hop.leaveYear, arrive: hop.arriveYear, approach: hop.approachYear, late,
      text: MAP_TEXT.card.timeline(hop.leaveYear, hop.arriveYear, hop.approachYear),
    };
  } else if (arm && slot === from) {
    schedule = MAP_TEXT.card.here(ship.approachYear);
  }

  // What the trip costs (the lead's call): the hits on the way (a lost ship's extras too), what ECC fixes while the unit
  // sleeps, and what lands.
  let cost: string | null = null;
  if (hop !== null && isReachable) {
    const extra = map.pendingExtra?.extraHits ?? 0;
    cost = MAP_TEXT.card.cost(hop.transitHits + extra, hop.eccFixes, hitsLanding(hop, extra));
  }

  return {
    slot, reachable: isReachable, state: seen.state,
    top: MAP_TEXT.card.top(ship.name, ship.world, ship.colonists, ship.pods), name: ship.name,
    sub: MAP_TEXT.card.sub(ship.world, ship.pods), colonists: MAP_TEXT.card.colonists(ship.colonists),
    tags, schedule, scheduleTone, cost, rows, timeline, fit,
  };
}

// --- The guidance strip and the opening beat ------------------------------------------------------------------------------

// The desk's guidance steps: pick a ship (done once one is selected), then SET COURSE to it.
export function deskSteps(state: Readonly<GameState>): DeskStep[] {
  const selected = state.ui.deskSelected;
  return [
    { id: 'pick-ship', text: MAP_TEXT.desk.pickShip, done: selected !== null },
    { id: 'set-course', text: MAP_TEXT.desk.setCourse(selected === null ? '…' : shipSummaryAt(state.run.map, selected).name), done: false },
  ];
}

// The ships whose approach passed since the last desk (02 §4's opening beat), earliest first: their approach year is
// after the galaxy year at the desk before (the ship before this one's approach; none on the first desk) and at or before
// now, and the unit never flew them. They grey one by one with a soft falling tone.
export function deskOpeningBeat(state: Readonly<GameState>): DeskOpeningBeat {
  const map = state.run.map;
  const route = map.route;
  const before = route.length >= 2 ? approachOf(map, route[route.length - 2]!.slot) : -Infinity;
  const greyed = mapSlots(map)
    .filter((slot) => !route.some((stop) => stop.slot === slot))
    .map((slot) => ({ slot, year: approachOf(map, slot) }))
    .filter(({ year }) => year > before && year <= map.galaxyYear)
    .sort((a, b) => a.year - b.year || a.slot - b.slot)
    .map(({ slot }) => slot);
  return { greyed, line: greyed.length > 0 ? MAP_TEXT.desk.greyed(greyed.length) : null };
}

// How a desk opens (the review's m3, m4): the first open of a desk visit (one per ship left: the run and how many ships it
// has ended) plays the opening, the greying chimes and CONTROL's typed line, and after a BEAM OUT waits for the old ship's
// blackout first; an open back from the PACKET (◀ CHART) shows the same desk at once and in silence.
export interface DeskOpening {
  visit: string;            // the visit's key: the view keeps the last one it opened
  replay: boolean;          // the opening plays (the first open of this visit)
  blackoutSec: number;      // the desk waits this long before it shows (BEAM OUT's blackout, first open only)
}

export function deskOpening(state: Readonly<GameState>, lastVisit: string | null): DeskOpening {
  const visit = `${state.run.seed}|${state.run.unitNumber}|${state.run.ships.length}`;
  const replay = visit !== lastVisit;
  return { visit, replay, blackoutSec: replay && state.burn.status === 'abandoned' ? BEAM_OUT_BLACKOUT_SEC : 0 };
}

// CONTROL's line as the desk opens (02 §2): the first desk of a run only.
export function deskControlLine(state: Readonly<GameState>): string | null {
  return state.run.map.route.length === 1 ? MAP_TEXT.desk.controlPick(state.run.unitNumber) : null;
}

// --- Actions ---------------------------------------------------------------------------------------------------------------

// The kid picks a ship on the chart (a click, or ← → cycling). Only a ship in reach can be picked: a TOO LATE or OUT OF
// RANGE click is refused (the view buzzes). Returns whether it was picked.
export function selectShip(store: Store<GameState>, slot: number): boolean {
  const state = store.getState();
  if (state.run.phase !== 'desk') throw new Error(`selectShip: not on the DESK (phase ${state.run.phase})`);
  if (!deskCandidates(state).includes(slot)) return false;
  if (state.ui.deskSelected !== slot) store.update((draft) => { draft.ui.deskSelected = slot; });
  return true;
}

// ← → on the desk: the next or previous ship in reach (wrapping), from the selection.
export function cycleShip(store: Store<GameState>, step: 1 | -1): number {
  const state = store.getState();
  const offered = deskCandidates(state);
  if (offered.length === 0) throw new Error('cycleShip: no ship in reach');
  const at = state.ui.deskSelected === null ? -1 : offered.indexOf(state.ui.deskSelected);
  const next = at < 0 ? offered[step === 1 ? 0 : offered.length - 1]! : offered[(at + step + offered.length) % offered.length]!;
  selectShip(store, next);
  return next;
}
