// Slice 4: Track UI owns this file (docs/phase3/impl/slice-4-plan.md §5.2): deskSteps, openDeskWindow,
// deskTabBadges.training. Others ask by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { NoiseCloud, ShipKind, DeskWindowId, Hop, RoomFit, ShipSummary, RunMapState } from '@/types/map';
import type { LinkNoise } from '@/types/threat';
import type { RepoFileId } from '@/types/repo';
import type { ColonyRecord, Departure, UnitTrail } from '@/types/lineage';
import { currentSlot, shipSummaryAt, worldSlotOf, isEndSlot } from '@systems/map-run';
import { armShipAt } from '@systems/map-streams';
import { unitTrailOf, olderColonies } from '@systems/lineage';
import { unitName } from '@data/hollow-text';
import { hollowLabel } from '@systems/say';
import { hopBetween, reachable, reachableFrom, hitsLanding } from '@systems/map-hop';
import { layerOf, solLy } from '@systems/map-geometry';
import { seedAllowance } from '@systems/map-noise';
import { traceSeedAllowance } from '@systems/trace-gifts';
import { unitArrival } from '@systems/arrival-preview';
import { deliveriesForHop, hopOutlook, recommendation, setRequest, type OutlookEntry } from '@systems/repository';
import { inboxUnread } from '@systems/inbox';
import { playsTutorial } from '@systems/meta';
import { shipsLeft } from '@systems/map-route';
import { mapFacts } from '@systems/map-facts';
import { planThreat, threatInputFor } from '@systems/threat-plan';
import { finalTraceInput } from '@systems/traces';
import { noWorkingRm } from '@state/threat-selectors';
import { swapAboard } from '@state/selectors';
import { layoutFor } from '@data/memory';
import { WORLDS, RING_LY, FIRST_SLOT } from '@data/arm';
import { FORGIVENESS_TEXT } from '@data/landing-text';
import { THREAT_TEXT } from '@data/threat-text';
import { SHIP_OUTCOME_WORD } from '@data/script';
import { MAP_TEXT, MODIFIER_LABEL } from '@data/map-text';
import { REPO_FILES } from '@data/repository';
import { REPO_TEXT, REPO_FILE_TEXT } from '@data/repo-text';
import { URGENT_SLACK_YEARS, BEAM_OUT_BLACKOUT_SEC, LEAVE_BLOCK_MAX_LINES, TRAIL_CROSS_PAST_COLONY_LY, MAX_RUNS_ON_CHART } from '@data/tuning';
import type { SkillId, CellRow } from '@/types/skill';
import { bankOf, deskBlocker, isFirstDesk, type TrainRefusal } from '@systems/skill-tree';
import { trainCell, restoreSkill, undoPurchase } from '@systems/training';
import { trainingModel, trainingArmed, cellKey, TRAINING_HOLD_SEC } from '@systems/training-model';
import { TRAINING_TEXT } from '@data/training-text';
import { residentCardRow, signalGlyph } from '@systems/resident-hud';
import { surveyCardRow } from '@systems/survey-hud';
import { traceCardRow, traceOnChart } from '@systems/trace-hud';
import { unknownCard } from '@systems/unknown-events';
import { unknownShown } from '@systems/signals';
import { UNKNOWN_TEXT } from '@data/unknown-text';
import { TRACE_HUD_TEXT } from '@data/trace-text';
import { siteDataOf } from '@data/survey';
import { RESIDENT_UI_TEXT } from '@data/resident-ui-text';

export type { DeskWindowId };

// The DESK's models (02-map §3.10, §4; slice-3a-plan §2.1, §3, §5.2), pure in the state, and its UI actions (selectShip,
// cycleShip). The flow's actions (openDesk, setCourse, backToChart) are systems/run.ts's: the desk only says which ship
// and how it reads. It reads ships only through systems/map-run.ts shipSummaryAt and the hop (never a built ShipDef: an
// arm ship is built only when the unit arrives), so every row can be computed for a ship no unit has reached.
// • chartModel: the STAR CHART's nodes (with their state, label, year and hover reason), the beams from the ship being
//   left to every ship in reach, the noise clouds, the route trail, the last unit's trail (046's written one on run 1)
//   with its TAKEN marks, colonies, grey cross and beacon, older units' colonies, and the key rings with the next one
//   labelled. Shared by the desk, the title card's faint chart and the RUN TALLY's mini chart.
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
  reason: string | null;    // the hover reason (`TOO LATE BY 18 YRS`, `SLEEP 31 YRS`, `VISITED · STABLE ORBIT`)
  onlyFromHere: boolean;    // in reach now and from no ship in reach after it (02 §2: ALBATROSS on the first desk)
  // The last unit gets to this world first (`UNIT-047 GETS THERE FIRST`, 046's on run 1) until the galaxy year passes its
  // stop there; null otherwise.
  taken: string | null;
  // Slice 3c (02 §4): a new ship's `REPORTED HOME` on the run's first desk, and (playtest 1, Q4) a waiting ship's last
  // chance, `PASSED OVER TWICE · IT WON'T WAIT AGAIN` (from run 2; null on run 1). The hover tip says it.
  history: string | null;
  historyWarn: boolean;     // the last-chance line, in the warning colour
  // `REPORTED HOME` beside the year on the run's first desk (the walk's "new nodes tagged REPORTED HOME"), else null.
  tag: string | null;
  // Slice 5 (plan R18): a ship ahead whose departed resident's note carries a signal fragment, once the run has found one
  // (the `▓░` glyph beside its node; systems/resident-hud.ts signalGlyph).
  signal: boolean;
  // Slice 7c (R38): a built trace's gift waits on this ship (the `◆`, the legend's TRACE; systems/trace-hud.ts traceOnChart,
  // Track CHART's; false until built).
  trace: boolean;
}

export interface ChartLine {
  from: number;
  to: number;
  noise: LinkNoise;         // solid when CLEAN, more hatched at LOW, NOISY, SEVERE
  urgent: boolean;
}

// The last unit's trail on the chart (02 §4; slice 3c, 3c plan §3, risk 10): 046's written one on run 1, the archive's from
// run 2 (systems/lineage.ts unitTrailOf). One mark per stop, in trail order, then the grey cross where it was lost. A stop
// the galaxy year has not passed is TAKEN (`HALCYON · TAKEN · UNIT-047 GETS THERE FIRST`; 046's, with no ship, `UNIT-046
// GETS THERE FIRST`); a passed one is its colony with its age (`RIVERSIDE · 52 YEARS OLD · UNIT-047`), or `NO COLONY`. The
// drawing offsets every stop's mark along the trail (TAKEN_MARK_OFFSET_PX), so the live node at that world stays readable.
export type TrailMarkKind = 'taken' | 'colony' | 'no-colony' | 'lost';

export interface TrailMark {
  slot: number;             // the world (an arm slot is its world); the cross: the world it was lost past
  x: number;                // LY from SOL (the cross: TrailLost.pastLy along the last leg)
  y: number;
  year: number;
  kind: TrailMarkKind;
  ship: string | null;      // the trail's ship there (null on 046's written trail, and on the cross)
  colony: string | null;
  passed: boolean;          // the galaxy year has passed its year (the cross: always false)
  label: string;
  // Drawn offset along the trail (every stop, and a cross on a world: the live ship there keeps its node); a cross past a
  // world (046's, past Calder) sits where it is.
  offset: boolean;
}

// The beacon the last unit set on its first ship's world (05 §3.5; the LANDING REPORT says it on ship 1): a ring round that
// stop's mark, with its words on hover.
export interface TrailBeacon {
  slot: number;
  label: string;            // `BEACON · SET BY UNIT-047 · 1 YEAR AGO`
}

export interface ChartTrail {
  unit: number;
  marks: TrailMark[];
  beacon: TrailBeacon | null;
}

// An older unit's colony (02 §4: faint green dots): one per world, the newest named, once the galaxy year has reached it.
export interface OlderColonyDot {
  slot: number;
  x: number;
  y: number;
  label: string;            // `LANTERN · 49 YEARS OLD · UNIT-047` (`+1` when the world has more)
}

export interface ChartRing {
  n: number;                // ring 1 … 6
  ly: number;
  label: string;
  next: boolean;            // the next ring out from the ship being left: the only one labelled
}

export interface ChartModel {
  galaxyYear: number;
  current: number;
  nodes: ChartNode[];
  lines: ChartLine[];
  clouds: NoiseCloud[];
  route: number[];          // the slots visited, in order (the bright trail)
  trail: ChartTrail | null; // the last unit's trail (046's on run 1); null when this run has none
  older: OlderColonyDot[];  // older units' colonies (never the trail's own: those are its marks)
  rings: ChartRing[];
  selected: number | null;
}

// One row of the SHIP CARD (02 §4: KNOWN PROBLEMS, MEMORY and its fit line, PLANET, LZ, BEAM, DELIVERIES, YOUR 3RD
// SHIP …). 'resident' is slice 5's (`RESIDENT · reported faulty`, after KNOWN PROBLEMS); 'site' is slice 6's (`SITE DATA ·
// POOR · ARRIVAL CONTROL GUESSED`, after PLANET and its no-go row: systems/survey-hud.ts surveyCardRow). 'deliveries' is 3b's (`Swap ✗ 4 YRS LATE`, `✓ CATCHES
// UP HERE`). 3c adds 'history' (`REPORTED HOME` / `PASSED OVER ONCE`, from run 2) and 'trail' (the last unit's mark at
// this ship's world: what the hover says on a desktop, readable on a phone, whose chart has no hover).
export interface CardRow {
  key: 'problems' | 'resident' | 'memory' | 'fit' | 'planet' | 'site' | 'lzs' | 'nogo' | 'beam' | 'noise' | 'range'
    | 'noswap' | 'deliveries' | 'threat' | 'norm' | 'only' | 'run' | 'history' | 'trail' | 'trace';
  label: string;
  value: string;
  tone: 'plain' | 'good' | 'warn';
}

// The TIMELINE strip (02 §4): the three years on one line, the text the strip reads, and 3b's delivery marks
// (`2629 Swap`: green before ▲ approach, red after), from the one outlook rule (systems/repository.ts hopOutlook).
export interface CardTimeline {
  leave: number;
  arrive: number;
  approach: number;
  late: boolean;
  text: string;
  marks: TimelineMark[];
}

export interface TimelineMark {
  key: string;              // the request's id (the pick's `rq${nextId}`)
  year: number;             // when the file is in this ship's receiver (a sent-on file rides with the unit: its arrival)
  late: boolean;            // after ▲ approach: red
  text: string;             // `2629 Swap`
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
  schedule: string | null;  // `YOU SLEEP 31 YRS IN ITS RECEIVER · ECC FIXES 1` / `TOO LATE BY 18 YRS` (null with no hop to show); the TIMELINE has the years
  scheduleTone: 'plain' | 'good' | 'warn';
  cost: string | null;      // `4 HITS ON THE WAY → 1 LANDS` (ships in reach)
  rows: CardRow[];
  timeline: CardTimeline | null;
  fit: RoomFit | null;      // the unit as it is now against the ship's room (null on the ship being left)
}

// The guidance strip's steps on a desk (02 §4): a ship, then SET COURSE. 3b inserts the recommended file ('request', the
// first desk only; it guides, SET COURSE never waits for it: decision 19), slice 4 the required TRAINING pick first
// (slice-3a-plan §2.10). `label` is the step's short name on the strip (`1 A SHIP · 2 A FILE · 3 SET COURSE`).
export interface DeskStep {
  id: 'train' | 'pick-ship' | 'request' | 'set-course';
  label: string;
  text: string;
  done: boolean;
}

// The opening beat (02 §4): the ships whose approach passed since the last desk, greying one by one; then the last unit's
// stops the year has passed since then, turning green one by one with a soft rising note (slice 3c).
export interface DeskOpeningBeat {
  greyed: number[];
  line: string | null;      // `2 SHIPS NOW OUT OF YOUR REACH`
  greened: number[];        // the trail marks' worlds (TrailMark.slot), earliest first
}

// The ships the unit can beam to from here, in slot order (the arrows cycle them).
export function deskCandidates(state: Readonly<GameState>): number[] {
  return reachableFrom(state.run.map, currentSlot(state.run));
}

// The ship SET COURSE would go to: the selection, if the kid made one.
export function deskTarget(state: Readonly<GameState>): number | null {
  return state.ui.deskSelected;
}

// Every slot on the map, in slot order.
function mapSlots(map: Readonly<RunMapState>): number[] {
  return map.arm.map((ship) => ship.slot);
}

// The ship in `slot`'s approach year, as the map has it.
function approachOf(map: Readonly<RunMapState>, slot: number): number {
  return shipSummaryAt(map, slot).approachYear;
}

// Ships in reach now that no ship in reach on the way to them can reach (02 §2: `ONLY FROM HERE: from any layer-2 ship
// you'd be TOO LATE`): a ship two layers out with ships in reach between, none of which can still get there in time.
// Skip it now and it is gone. A ship in the next layer has nothing between, so it is never flagged.
export function onlyFromHere(map: Readonly<RunMapState>, from: number): number[] {
  const offered = reachableFrom(map, from);
  return offered.filter((target) => {
    const between = offered.filter((via) => layerOf(via) < layerOf(target));
    return between.length > 0 && !between.some((via) => reachable(map, via, target));
  });
}

// A node's state and its hover reason, seen from the ship being left at the galaxy year.
function nodeState(
  state: Readonly<GameState>, slot: number, from: number,
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
  const hop = hopBetween(map, from, slot);
  if (!outward) return { state: 'out-of-range', reason: MAP_TEXT.chart.behind, hop };
  if (!hop.inRange) return { state: 'out-of-range', reason: MAP_TEXT.chart.outOfRange(hop.distanceLy), hop };
  if (hop.slackYears < 0) return { state: 'too-late', reason: MAP_TEXT.chart.tooLate(-hop.slackYears), hop };
  if (hop.slackYears < URGENT_SLACK_YEARS) return { state: 'urgent', reason: MAP_TEXT.chart.urgent(hop.slackYears), hop };
  return { state: 'reachable', reason: MAP_TEXT.chart.sleep(hop.slackYears), hop };
}

function worldXY(map: Readonly<RunMapState>, slot: number): { x: number; y: number } {
  const world = WORLDS[worldSlotOf(map, slot)]!;
  return { x: world.x, y: world.y };
}

// The last unit's trail as the chart draws it (systems/lineage.ts unitTrailOf: 046's written one on run 1, the archive's
// from run 2), at the map's galaxy year; null when the run has no trail. A stop is passed once
// the galaxy year is past its year (so a colony is never `0 YEARS OLD`). The grey cross sits TrailLost.pastLy past the
// world it was lost at, along the leg that led there (05: `a grey cross past Calder`).
export function chartTrail(run: Readonly<Pick<GameState['run'], 'lastUnit' | 'map'>>): ChartTrail | null {
  const map = run.map;
  const trail = unitTrailOf(run);
  if (trail === null) return null;
  const unit = unitName(trail.unit);
  const marks = trail.stops.map((stop): TrailMark => {
    const world = WORLDS[stop.slot];
    if (world === undefined) throw new Error(`chartTrail: unit ${trail.unit}'s trail stops at slot ${stop.slot}, which is no world`);
    const passed = map.galaxyYear > stop.year;
    const colony = stop.landed > 0 ? stop.colony : null;
    let kind: TrailMarkKind;
    let label: string;
    if (!passed) {
      kind = 'taken';
      label = stop.shipName === null ? MAP_TEXT.chart.takenNoShip(unit) : MAP_TEXT.chart.taken(stop.shipName, unit);
    } else if (colony !== null) {
      kind = 'colony';
      label = MAP_TEXT.chart.colony(colony, map.galaxyYear - stop.year, unit);
    } else {
      kind = 'no-colony';
      label = MAP_TEXT.chart.noColony(unit);
    }
    return { slot: stop.slot, x: world.x, y: world.y, year: stop.year, kind, ship: stop.shipName, colony, passed, label, offset: true };
  });
  if (trail.lost !== null) {
    const lost = trail.lost;
    const world = WORLDS[lost.slot];
    if (world === undefined) throw new Error(`chartTrail: unit ${trail.unit} was lost at slot ${lost.slot}, which is no world`);
    const cross = { year: lost.year, kind: 'lost' as const, ship: null, colony: null, passed: false, label: MAP_TEXT.chart.lostCross(unit) };
    const last = marks.at(-1);
    const aboard = lost.pastLy === 0 && last !== undefined && last.slot === lost.slot;
    if (aboard && last.colony === null) {
      // A unit lost aboard its last ship (Track WORLD: the cross on that stop's world, 0 LY past it), which founded nothing:
      // the cross is that stop's mark, offset along the trail as every stop's is.
      marks[marks.length - 1] = { ...last, ...cross };
    } else {
      // A cross past a world (046's, past Calder): along the leg that led there, from the stop before the world it was lost
      // at, or from SOL when the trail has none. A unit lost after its last ship founded a colony (abandoned at that desk, or
      // lost on the way on; review fix, minor 8, by 05 §3.5: the colony is real, and the grey cross marks where the unit was
      // lost, at or past that world) keeps the colony's mark, and its cross stands TRAIL_CROSS_PAST_COLONY_LY past it.
      const pastLy = aboard ? TRAIL_CROSS_PAST_COLONY_LY : lost.pastLy;
      const before = [...trail.stops].reverse().find((stop) => stop.slot !== lost.slot);
      const prev = before === undefined ? { x: 0, y: 0 } : WORLDS[before.slot]!;
      const len = Math.hypot(world.x - prev.x, world.y - prev.y) || 1;
      marks.push({
        slot: lost.slot, x: world.x + ((world.x - prev.x) / len) * pastLy, y: world.y + ((world.y - prev.y) / len) * pastLy,
        ...cross, offset: pastLy === 0,
      });
    }
  }
  // The beacon on the first ship's world (05 §3.5): the trail's stop there reached orbit.
  const first = trail.stops.find((stop) => stop.slot === FIRST_SLOT);
  const beacon = first !== undefined && (first.outcome === 'locked' || first.outcome === 'partial') && first.year <= map.startYear
    ? { slot: FIRST_SLOT, label: MAP_TEXT.chart.beacon(unit, map.startYear - first.year) }
    : null;
  return { unit: trail.unit, marks, beacon };
}

// 046's written trail's marks on run 1 (the chart's trail before 3c; tests read it): chartTrail on a run with no archive.
export function trail046(map: Readonly<RunMapState>): TrailMark[] {
  if (map.run !== 1) return [];
  return chartTrail({ lastUnit: null, map })?.marks ?? [];
}

// Older units' colonies (02 §4: faint green dots), never the trail's own (its marks say them): one dot per world, named by
// its newest colony, once the galaxy year has reached it (systems/lineage.ts olderColonies).
export function olderColonyDots(map: Readonly<RunMapState>, trail: Readonly<Pick<UnitTrail, 'unit' | 'run'>> | null): OlderColonyDot[] {
  const older = olderColonies(map).filter((colony) => trail === null || colony.unit !== trail.unit || colony.run !== trail.run);
  const bySlot = new Map<number, ColonyRecord[]>();
  for (const colony of older) bySlot.set(colony.slot, [...(bySlot.get(colony.slot) ?? []), colony]);
  return [...bySlot.entries()].sort((a, b) => a[0] - b[0]).map(([slot, colonies]) => {
    const newest = [...colonies].sort((a, b) => b.year - a.year || b.run - a.run)[0]!;
    const world = WORLDS[slot];
    if (world === undefined) throw new Error(`olderColonyDots: colony ${newest.name} is on slot ${slot}, which is no world`);
    const label = MAP_TEXT.chart.colony(newest.name, map.galaxyYear - newest.year, unitName(newest.unit));
    return { slot, x: world.x, y: world.y, label: colonies.length > 1 ? MAP_TEXT.chart.olderMore(label, colonies.length - 1) : label };
  });
}

// A ship's history on the chart and its card (02 §4), from run 2: a new one's REPORTED HOME (`firstDesk`: the run's first
// desk only, on the chart; the card always says it), and how often the units before passed a waiting one over (playtest 1,
// Q4). The chart says the passes only on the ship's last run (`lastChance`: after it the ship comes in on its own,
// map-update.ts); the card always does. null on run 1.
function shipHistory(
  map: Readonly<RunMapState>, slot: number, where: 'chart' | 'card', firstDesk: boolean,
): { text: string; lastChance: boolean } | null {
  if (map.run <= 1) return null;
  const ship = armShipAt(map, slot);
  if (ship.runsOnChart > 1) {
    const lastChance = ship.runsOnChart >= MAX_RUNS_ON_CHART;
    if (where === 'chart' && !lastChance) return null;
    return { text: MAP_TEXT.chart.passedOver(ship.runsOnChart, MAX_RUNS_ON_CHART), lastChance };
  }
  return firstDesk && ship.reportedRun === map.run ? { text: MAP_TEXT.chart.reportedHome, lastChance: false } : null;
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
  const trail = chartTrail(state.run);
  const firstDesk = map.route.length === 1;
  const nodes = mapSlots(map).map((slot): ChartNode => {
    const ship = shipSummaryAt(map, slot);
    const { x, y } = worldXY(map, slot);
    const seen = nodeState(state, slot, from);
    const world = worldSlotOf(map, slot);
    const taken = trail?.marks.some((mark) => mark.kind === 'taken' && mark.slot === world) === true;
    const history = shipHistory(map, slot, 'chart', firstDesk);
    // Slice 7d (R39): a `?` ship not visited yet gives no size away (its label `???`, its node a standard ship's).
    const hidden = unknownShown(state.run, slot);
    return {
      slot, name: ship.name, world: ship.world, x, y, kind: hidden && ship.kind === 'ark' ? 'standard' : ship.kind, colonists: ship.colonists,
      tight: ship.memoryClass === 'TIGHT', isFinal: ship.final, state: seen.state,
      label: hidden ? UNKNOWN_TEXT.chartNode(ship.name) : MAP_TEXT.chart.node(ship.name, ship.colonists), year: ship.approachYear, reason: seen.reason,
      onlyFromHere: only.has(slot),
      taken: taken && trail !== null ? MAP_TEXT.chart.takenNoShip(unitName(trail.unit)) : null,
      history: history?.text ?? null,
      historyWarn: history?.lastChance === true,
      tag: history?.text === MAP_TEXT.chart.reportedHome && seen.state !== 'current' ? history.text : null,
      signal: signalGlyph(state, slot),
      trace: traceOnChart(state, slot),
    };
  });
  const lines = offered.map((to): ChartLine => {
    const hop = hopBetween(map, from, to);
    return { from, to, noise: hop.noise, urgent: hop.slackYears < URGENT_SLACK_YEARS };
  });
  return {
    galaxyYear: map.galaxyYear, current: from, nodes, lines, clouds: map.noise.map((cloud) => ({ ...cloud })),
    route: map.route.map((stop) => stop.slot), trail, older: olderColonyDots(map, trail === null ? null : unitTrailOf(state.run)),
    rings: chartRings(map, from), selected: state.ui.deskSelected,
  };
}

// The chart's key for the slice-3c marks (the desk shows it in a corner): one entry per kind of mark the chart has now, in a
// fixed order. The hover and the card carry each mark's own words; the key says what the glyphs are.
export type ChartLegendKind = 'taken' | 'colony' | 'lost' | 'new' | 'older' | 'signal' | 'trace';

export interface ChartLegendItem {
  kind: ChartLegendKind;
  words: string;
}

export function chartLegend(model: Readonly<ChartModel>): ChartLegendItem[] {
  const trail = model.trail;
  const has = (kind: TrailMarkKind): boolean => trail?.marks.some((mark) => mark.kind === kind) === true;
  const unit = trail === null ? '' : unitName(trail.unit);
  const items: ChartLegendItem[] = [];
  if (has('taken')) items.push({ kind: 'taken', words: MAP_TEXT.chart.legendTaken(unit) });
  if (has('colony')) items.push({ kind: 'colony', words: MAP_TEXT.chart.legendColony(unit) });
  if (has('lost')) items.push({ kind: 'lost', words: MAP_TEXT.chart.legendLost(unit) });
  if (model.older.length > 0) items.push({ kind: 'older', words: MAP_TEXT.chart.legendOlder });
  if (model.nodes.some((node) => node.tag !== null)) items.push({ kind: 'new', words: MAP_TEXT.chart.reportedHome });
  if (model.nodes.some((node) => node.signal)) items.push({ kind: 'signal', words: RESIDENT_UI_TEXT.chart.legend });
  // Slice 7c (R38): the `◆` of a gift ship (Track CHART's nodes).
  if (model.nodes.some((node) => node.trace)) items.push({ kind: 'trace', words: TRACE_HUD_TEXT.legend });
  return items;
}

// --- The SHIP CARD ------------------------------------------------------------------------------------------------------

// KNOWN PROBLEMS' labels: the template's own arrival and the extra modifiers (02 §3.5); DEBRIS names its rack when the
// arm stored it.
export function problemLabels(ship: Readonly<ShipSummary>): string[] {
  return ship.modifiers.map((id) => (id === 'debris' && ship.debrisRack !== null ? MAP_TEXT.card.debris(ship.debrisRack) : MODIFIER_LABEL[id]));
}

function fitTone(fit: Readonly<RoomFit>): CardRow['tone'] {
  return fit.word !== 'fits' || fit.chargeArrivesMin < fit.chargeArrives ? 'warn' : 'good';
}

export function cardModel(state: Readonly<GameState>, slot: number): CardModel {
  const map = state.run.map;
  const from = currentSlot(state.run);
  const ship = shipSummaryAt(map, slot);
  const offered = reachableFrom(map, from);
  const seen = nodeState(state, slot, from);
  const isReachable = offered.includes(slot);
  const tags = [...(ship.kind === 'ark' ? [MAP_TEXT.card.ark] : []), ...(ship.final ? [MAP_TEXT.card.finalShip] : [])];
  const rows: CardRow[] = [];
  const row = (key: CardRow['key'], label: string, value: string, tone: CardRow['tone'] = 'plain'): void => {
    rows.push({ key, label, value, tone });
  };
  const layout = layoutFor(ship.memoryClass);
  const depth = map.route.length + 1;

  // The hop (the beam from the ship being left), for every ship but that one: the card shows TOO LATE and OUT OF RANGE
  // ships too, and prints the beam only when it is in range (Hop.inRange).
  const hop = slot === from ? null : (seen.hop ?? hopBetween(map, from, slot));
  // The ladder's verdict for this beam, from the run's threat with this ship's tally done: HOLLOW's line and the seeds the
  // beam may bring (the PACKET's own rule: systems/map-noise.ts seedAllowance), for any beam in range.
  const verdict = hop !== null && (isReachable || hop.inRange)
    ? planThreat(threatInputFor(state.run.threat, mapFacts(map, from, slot, depth), state.run.stats.deal !== null, finalTraceInput(state.run)))
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
  // Slice 5 (02 §8 slice 5): what the ship's own AI is reported as, and after the ship what it was (systems/resident-hud.ts).
  const resident = residentCardRow(state, slot);
  if (resident !== null) row('resident', resident.label, resident.value, resident.tone);
  // 3b: what the requests (and this desk's pick) do on this hop (02 §4's DELIVERIES row, the TIMELINE's marks), from the one
  // outlook rule, for a ship SET COURSE can go to (review m1: as repoModel; a ship behind the unit or out of range is
  // never sent toward, so its card promised nothing).
  const outlook = hop !== null && isReachable ? hopOutlook(state, from, slot) : [];
  // Review item 1 (d): an ENGINE FAULT ship with no Swap aboard and none riding this hop (the pick included) says so under
  // its KNOWN PROBLEMS, so the kid can route around it or ask for Swap first.
  if (isReachable && ship.modifiers.includes('engine-fault') && !swapAboard(state)
    && !outlook.some((entry) => entry.file === 'swap' && entry.rides)) {
    row('noswap', '', REPO_TEXT.card.noSwapInTime, 'warn');
  }
  row('memory', MAP_TEXT.card.memoryLabel, MAP_TEXT.card.memory(layout.totalBlocks, ship.memoryClass, layout.roomForUnit));

  row('planet', MAP_TEXT.card.planetLabel, MAP_TEXT.card.planet(ship.terrain, FORGIVENESS_TEXT[ship.forgiveness].offSite));
  if (ship.noGoWords.length > 0) row('nogo', MAP_TEXT.card.noGoLabel, MAP_TEXT.card.noGo(ship.noGoWords), 'warn');
  // Slice 6 (R15): the SITE DATA row (Track SITES's model), and the LZ row's words by the site data this build plays.
  const site = surveyCardRow(state, slot);
  if (site !== null) row('site', site.label, site.value, site.tone);
  row('lzs', MAP_TEXT.card.lzLabel, MAP_TEXT.card.lzs(ship.lzCount, siteDataOf({ site: ship.reserved?.site ?? 'good' })));

  if (hop !== null && hop.inRange) {
    const allowance = verdict === null ? null : seedAllowance(verdict, playsTutorial(state.run));
    // Slice 7c: the traces' seed rules into this ship (Track TRACE's, neutral until built), as the PACKET counts them.
    const seeds = allowance === null ? null : traceSeedAllowance(state, slot, allowance);
    row('beam', MAP_TEXT.card.beamLabel, MAP_TEXT.card.beam(hop.distanceLy));
    row('noise', '', MAP_TEXT.card.noise(hop.noise, MAP_TEXT.card.seeds(seeds)), hop.noise > 0 ? 'warn' : 'plain');
  } else if (hop !== null) {
    row('range', MAP_TEXT.card.beamLabel, MAP_TEXT.chart.outOfRange(hop.distanceLy), 'warn');
  }

  // HOLLOW boarding on this beam is said before SET COURSE (04 §3.8; slice-3a-plan §1.1 item 14): the ladder's verdict
  // for this candidate, from the run's threat with this ship's tally done. It is named as the strip names it (`???` until
  // it has named itself): playtest 1, never HOLLOW before the game has said it.
  if (isReachable && verdict !== null && verdict.boards !== null) {
    row('threat', MAP_TEXT.card.threatLabel, THREAT_TEXT.willFindYou(hollowLabel(state.run)), 'warn');
  }
  if (ship.final && noWorkingRm(state)) row('norm', MAP_TEXT.card.threatLabel, THREAT_TEXT.noRmPacket, 'warn');
  if (isReachable && onlyFromHere(map, from).includes(slot)) row('only', '', MAP_TEXT.card.onlyFromHere, 'warn');

  const deliveries = deliveriesRow(outlook);
  if (deliveries !== null) row('deliveries', REPO_TEXT.card.deliveriesLabel, deliveries.value, deliveries.tone);

  // Slice 3c (02 §4): its history (from run 2), and the last unit's mark at its world (TAKEN, or its colony with its age).
  const history = shipHistory(map, slot, 'card', true);
  if (history !== null) row('history', MAP_TEXT.card.historyLabel, history.text, history.lastChance ? 'warn' : 'plain');
  const mark = chartTrail(state.run)?.marks.find((candidate) => candidate.offset && candidate.slot === worldSlotOf(map, slot));
  if (mark !== undefined) row('trail', MAP_TEXT.card.trailLabel, mark.label, mark.kind === 'colony' ? 'good' : 'plain');
  // Slice 7c (R38): the trace row (the last ending on the final ship, a gift ship's cache; Track CHART's, none until built).
  const trace = traceCardRow(state, slot);
  if (trace !== null) row('trace', trace.label, trace.value, trace.tone);

  if (isReachable || slot === from) {
    const [min, max] = shipsLeft(map, slot);
    const at = slot === from ? map.route.length : depth;
    row('run', '', isEndSlot(map, slot) ? MAP_TEXT.card.lastOfRun(at) : MAP_TEXT.card.shipOfRun(at, min, max));
  }

  let schedule: string | null = null;
  let scheduleTone: CardModel['scheduleTone'] = 'plain';
  let timeline: CardTimeline | null = null;
  if (hop !== null) {
    const late = hop.slackYears < 0;
    schedule = late ? MAP_TEXT.card.late(-hop.slackYears) : MAP_TEXT.card.sleep(hop.slackYears, hop.eccFixes);
    scheduleTone = late ? 'warn' : hop.slackYears < URGENT_SLACK_YEARS ? 'warn' : 'good';
    timeline = {
      leave: hop.leaveYear, arrive: hop.arriveYear, approach: hop.approachYear, late,
      text: MAP_TEXT.card.timeline(hop.leaveYear, hop.arriveYear, hop.approachYear),
      marks: timelineMarks(outlook, hop),
    };
  } else if (slot === from) {
    schedule = MAP_TEXT.card.here(ship.approachYear);
  }

  // What the trip costs (the lead's call): the hits on the way (a lost ship's extras too), what ECC fixes while the unit
  // sleeps, and what lands.
  let cost: string | null = null;
  if (hop !== null && isReachable) {
    const extra = map.pendingExtra?.extraHits ?? 0;
    cost = MAP_TEXT.card.cost(hop.transitHits + extra, hitsLanding(hop, extra));
  }

  // Slice 7d (R39): a `?` ship not visited yet shows its public schedule, and every other row `??? · NO TRANSPONDER`
  // (systems/unknown-events.ts unknownCard; the model as it is for every other ship).
  return unknownCard(state, slot, {
    slot, reachable: isReachable, state: seen.state,
    top: MAP_TEXT.card.top(ship.name, ship.world, ship.colonists, ship.pods), name: ship.name,
    sub: MAP_TEXT.card.sub(ship.world, ship.pods), colonists: MAP_TEXT.card.colonists(ship.colonists),
    tags, schedule, scheduleTone, cost, rows, timeline, fit,
  }, ship.world);
}

// --- The card's deliveries (phase 3 slice 3b; 02 §4) -----------------------------------------------------------------------

// The DELIVERIES row from a hop's outlook (`Swap ✗ 4 YRS LATE · Mv ✓ CATCHES UP HERE`), or null with nothing on the way:
// red while any file misses the approach, green when every one is there for it.
export function deliveriesRow(outlook: readonly OutlookEntry[]): { value: string; tone: CardRow['tone'] } | null {
  if (outlook.length === 0) return null;
  const words = outlook.map((entry) => {
    const name = REPO_FILES[entry.file].name;
    switch (entry.kind) {
      case 'in-time': return REPO_TEXT.card.inTime(name);
      case 'catches-up': return REPO_TEXT.card.catchesUp(name);
      case 'waiting': return REPO_TEXT.card.ridesWithYou(name);
      case 'late': return REPO_TEXT.card.late(name, entry.yearsLate);
      // Review m2: no route catches it up, so no count of years (it read `✗ 4 YRS LATE`, as if it still might).
      case 'never': return REPO_TEXT.card.never(name);
    }
  });
  return { value: words.join(' · '), tone: outlook.every((entry) => entry.rides) ? 'good' : 'warn' };
}

// The TIMELINE's marks: each file at the year it is in this ship's receiver (a file sent on rides in the packet: the
// unit's own arrival), in year order. Late (red) when after ▲ approach.
export function timelineMarks(outlook: readonly OutlookEntry[], hop: Readonly<Pick<Hop, 'arriveYear' | 'approachYear'>>): TimelineMark[] {
  return outlook
    .map((entry): TimelineMark => {
      const year = entry.kind === 'waiting' ? hop.arriveYear : entry.arrivedYear;
      return { key: entry.key, year, late: year > hop.approachYear, text: REPO_TEXT.card.mark(year, REPO_FILES[entry.file].name) };
    })
    .sort((a, b) => a.year - b.year || (a.key < b.key ? -1 : 1));
}

// --- The guidance strip and the opening beat ------------------------------------------------------------------------------

// The desk's guidance steps: pick a ship (done once one is selected), then SET COURSE to it. On a run's first desk on the
// arm the recommended file comes between (02 §4: ship → file → SET COURSE): done once any request is set; it only
// guides, SET COURSE never waits for it (decision 19; plan risk 2).
// SET COURSE waits for the required first pick (slice 4, plan §2.5): skill-tree.ts deskBlocker. The DESK's bar, its step
// and ENTER read this one rule.
export function firstPickWaits(state: Readonly<GameState>): boolean {
  return deskBlocker(state) !== null;
}

// Slice 4 (plan §2.5): the run's first desk on the arm opens with the required first skill (`A SKILL`), done once this
// desk's pick is pending (firstPickWaits clears); SET COURSE waits for it there.
export function deskSteps(state: Readonly<GameState>): DeskStep[] {
  const selected = state.ui.deskSelected;
  const steps: DeskStep[] = [];
  const firstDesk = isFirstDesk(state.run);
  if (firstDesk) {
    const pick = state.run.skills.pending.find((purchase) => purchase.kind === 'train');
    const done = !firstPickWaits(state);
    const text = pick !== undefined
      ? TRAINING_TEXT.stepDone(TRAINING_TEXT.skills[pick.skill].name, pick.to.version) : TRAINING_TEXT.stepText;
    steps.push({ id: 'train', label: TRAINING_TEXT.step, text, done });
  }
  steps.push({ id: 'pick-ship', label: MAP_TEXT.desk.stepPick, text: MAP_TEXT.desk.pickShip, done: selected !== null });
  if (firstDesk) {
    const pick = state.run.repo.pick;
    const recommended = recommendation(state);
    const text = pick !== null
      ? REPO_TEXT.desk.requested(REPO_FILE_TEXT[pick].boot)
      : recommended !== null ? REPO_TEXT.desk.request(REPO_FILE_TEXT[recommended].boot) : REPO_TEXT.desk.requestAny;
    steps.push({ id: 'request', label: MAP_TEXT.desk.stepFile, text, done: pick !== null });
  }
  // While a TRAINING cell is armed ENTER trains it, so the step names SPACE (review M3).
  const ship = selected === null ? '…' : shipSummaryAt(state.run.map, selected).name;
  steps.push({
    id: 'set-course', label: MAP_TEXT.desk.stepCourse,
    text: deskEnter(state) === 'train' ? MAP_TEXT.desk.setCourseSpace(ship) : MAP_TEXT.desk.setCourse(ship), done: false,
  });
  return steps;
}

// What ENTER does on the desk (slice 4 review M3, the lead's ruling): it trains (or restores) only a TRAINING cell the kid
// picked this visit, while the tab is open and the cell has an action (a dim one buzzes); a filling bar keeps it (nothing
// happens). Otherwise it sets course, as everywhere else. SPACE always sets course.
export type DeskEnter = 'train' | 'set-course';

export function deskEnter(state: Readonly<GameState>): DeskEnter {
  if (state.run.phase !== 'desk') return 'set-course';
  if (state.ui.trainingHoldSec !== null) return 'train';
  if (!trainingArmed(state)) return 'set-course';
  return trainingModel(state).detail?.action ? 'train' : 'set-course';
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
  // The last unit's colonies the year passed since the last desk (on the first desk: since the run's start, which the title
  // already showed): passed now (galaxy year > its year), not at the last desk's year.
  const since = route.length >= 2 ? before : map.startYear;
  const greened = (chartTrail(state.run)?.marks ?? [])
    .filter((mark) => mark.kind === 'colony' && mark.year >= since)
    .sort((a, b) => a.year - b.year || a.slot - b.slot)
    .map((mark) => mark.slot);
  return { greyed, line: greyed.length > 0 ? MAP_TEXT.desk.greyed(greyed.length) : null, greened };
}

// The opening desk's departures block (02 §4; 3c plan §3 step 4): the ships of the last arm that are no longer this unit's
// to take, said in the future tense (`PETREL · ANOTHER CORE IS ON ITS WAY`), at most LEAVE_BLOCK_MAX_LINES then `+n MORE`.
// The ships the last unit flew are its trail's marks, and the first ship's leaving is said nowhere (02 §3.12), so only
// the ships that moved on are listed. `all` is every line (the block's hover). null past the run's first desk and on run 1.
export interface DeskDepartures {
  title: string;
  lines: string[];
  more: string | null;
  all: string[];
}

export function deskDepartures(state: Readonly<GameState>): DeskDepartures | null {
  const map = state.run.map;
  if (map.run <= 1 || map.route.length !== 1) return null;
  return departuresBlock(map.history.departures);
}

// The block's lines from a list of departures (the desk's from the map's history; the RUN TALLY's from the next arm).
export function departuresBlock(departures: readonly Departure[]): DeskDepartures | null {
  const all = departures.flatMap((departure) => {
    const words = departure.words;
    return words === 'core-coming' || words === 'own-way' ? [MAP_TEXT.chart.leaveLine(departure.name, MAP_TEXT.chart.leave[words])] : [];
  });
  if (all.length === 0) return null;
  const fits = all.length <= LEAVE_BLOCK_MAX_LINES;
  const lines = fits ? all : all.slice(0, LEAVE_BLOCK_MAX_LINES - 1);
  return {
    title: MAP_TEXT.chart.leaveTitle(all.length), lines, more: fits ? null : MAP_TEXT.chart.leaveMore(all.length - lines.length), all,
  };
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

// CONTROL's line as the desk opens (02 §2): the first desk of a run only. From run 2, when the unit ahead has taken a ship
// on this chart, CONTROL is delighted about that instead (02 §4: `UNIT-047 got here first. :)`).
export function deskControlLine(state: Readonly<GameState>): string | null {
  const map = state.run.map;
  if (map.route.length !== 1) return null;
  const trail = map.run > 1 ? chartTrail(state.run) : null;
  if (trail !== null && trail.marks.some((mark) => mark.kind === 'taken' && mark.ship !== null)) {
    return MAP_TEXT.chart.controlFirst(unitName(trail.unit));
  }
  return MAP_TEXT.desk.controlPick(state.run.unitNumber);
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

// --- The desk's tabs (phase 3 slice 3b; 02 §4: R / I; slice-3b-plan §5.2 item 1) --------------------------------------

// The tab beside the chart: the SHIP CARD (null), the REPOSITORY, TRAINING (slice 4, [T]) or the INBOX. Escape goes back
// to the card.
export function openDeskWindow(store: Store<GameState>, id: DeskWindowId | null): void {
  const state = store.getState();
  if (state.run.phase !== 'desk') throw new Error(`openDeskWindow: not on the DESK (phase ${state.run.phase})`);
  if (state.ui.deskWindow === id) return;
  store.update((draft) => {
    draft.ui.deskWindow = id;
    // Another tab disarms TRAINING and stops a filling bar (review M3).
    if (id !== 'training') { draft.ui.trainingArmed = false; draft.ui.trainingHoldSec = null; }
  });
}

// --- TRAINING's actions (slice 4; plan §2.5; the model is systems/training-model.ts) ---------------------------------------

// A cell (a click, a card's [1] / [2], ↑ ↓ in the grid) becomes the selection, armed (ENTER trains it: review M3); a TRAIN
// bar filling for another cell stops.
export function selectTrainingCell(store: Store<GameState>, skill: SkillId, row: CellRow): void {
  const state = store.getState();
  if (state.run.phase !== 'desk') throw new Error(`selectTrainingCell: not on the DESK (phase ${state.run.phase})`);
  const same = state.ui.trainingSel !== null && state.ui.trainingSel.skill === skill
    && cellKey(state.ui.trainingSel.skill, state.ui.trainingSel.row) === cellKey(skill, row);
  if (same && state.ui.trainingArmed) return;
  store.update((draft) => {
    draft.ui.trainingSel = { skill, row: { ...row } };
    draft.ui.trainingArmed = true;
    if (!same) draft.ui.trainingHoldSec = null;
  });
}

// ESC on an armed cell: the selection stays on screen, and ENTER sets course again (review M3).
export function disarmTraining(store: Store<GameState>): void {
  const ui = store.getState().ui;
  if (ui.trainingArmed || ui.trainingHoldSec !== null) store.update((draft) => { draft.ui.trainingArmed = false; draft.ui.trainingHoldSec = null; });
}

// ↑ ↓ in the grid: the next or previous cell that is open, in the model's order, from the selection (wrapping).
export function stepTrainingCell(store: Store<GameState>, step: 1 | -1): void {
  const model = trainingModel(store.getState());
  const open = model.cells.filter((cell) => cell.look !== 'closed' && cell.look !== 'unbuilt');
  if (open.length === 0) return;
  const at = model.selected === null ? -1 : open.findIndex((cell) => cell.key === model.selected!.key);
  const next = at < 0 ? open[step === 1 ? 0 : open.length - 1]! : open[(at + step + open.length) % open.length]!;
  selectTrainingCell(store, next.skill, next.row);
}

// TRAIN (or RESTORE) on the selection starts its bar; the view advances it on wall time (advanceTrainingHold) and the
// purchase lands when it is full. Returns false when there is nothing to buy there now (the view buzzes).
export function startTrainingHold(store: Store<GameState>): boolean {
  const state = store.getState();
  if (state.run.phase !== 'desk' || state.ui.trainingHoldSec !== null) return false;
  const action = trainingModel(state).detail?.action ?? null;
  if (action === null || !action.enabled) return false;
  const sel = trainingModel(state).selected;
  if (sel === null) throw new Error('startTrainingHold: an action with no cell selected');
  store.update((draft) => {
    draft.ui.trainingSel = { skill: sel.skill, row: { ...sel.row } };
    draft.ui.trainingHoldSec = 0;
  });
  return true;
}

export function cancelTrainingHold(store: Store<GameState>): void {
  if (store.getState().ui.trainingHoldSec !== null) store.update((draft) => { draft.ui.trainingHoldSec = null; });
}

// The bar after `dtSec` more wall seconds. Full (TRAINING_HOLD_SEC): the selection is trained, or restored (training.ts
// trainCell / restoreSkill), the bar goes, and the result says so: 'done', a refusal (the view buzzes), or 'filling'.
export function advanceTrainingHold(store: Store<GameState>, dtSec: number): 'filling' | 'done' | TrainRefusal {
  const state = store.getState();
  const hold = state.ui.trainingHoldSec;
  if (hold === null) throw new Error('advanceTrainingHold: no TRAIN bar is filling');
  const next = hold + Math.max(0, dtSec);
  if (next < TRAINING_HOLD_SEC) {
    store.update((draft) => { draft.ui.trainingHoldSec = next; });
    return 'filling';
  }
  const model = trainingModel(state);
  const cell = model.selected;
  const action = model.detail?.action ?? null;
  store.update((draft) => { draft.ui.trainingHoldSec = null; });
  if (cell === null || action === null) throw new Error('advanceTrainingHold: the bar filled with nothing selected');
  const refusal = action.kind === 'restore' ? restoreSkill(store, cell.skill) : trainCell(store, cell.skill, cell.row);
  return refusal ?? 'done';
}

// UNDO beside a purchase of this desk (training.ts undoPurchase: only the last of its skill). The selection moves to the
// cell it gave back, unarmed (review M3: an ENTER after an UNDO sets course; TRAIN or a click buys it again).
export function undoTraining(store: Store<GameState>, index: number): void {
  const purchase = store.getState().run.skills.pending[index];
  if (purchase === undefined) throw new Error(`undoTraining: no pending purchase ${index}`);
  undoPurchase(store, index);
  const row: CellRow = purchase.kind === 'lock' ? { kind: 'lock', level: purchase.to.lock as 1 | 2 } : { kind: 'version', version: purchase.to.version };
  store.update((draft) => {
    draft.ui.trainingSel = { skill: purchase.skill, row };
    draft.ui.trainingHoldSec = null;
    draft.ui.trainingArmed = false;
  });
}

// A REQUEST toggle on a REPOSITORY row (or its number key): request `file`, or clear it when it is already this desk's
// request (02 §3.8: one request per transmit, changeable until TRANSMIT ▸). Returns the pick after the toggle.
export function toggleRequest(store: Store<GameState>, file: RepoFileId): RepoFileId | null {
  const next = store.getState().run.repo.pick === file ? null : file;
  setRequest(store, next);
  return next;
}

// The tab badges (02 §4: badges for unread mail): the INBOX's unread count; the REPOSITORY's names this desk's request,
// or `:)` while CONTROL recommends a file and none is asked for. null shows none.
// Slice 4: TRAINING's names the cycles while any are unspent (`6 CYCLES`, 03 §4: the badge pulses while they are).
export interface DeskTabBadges {
  repository: string | null;
  training: string | null;
  inbox: string | null;
}

export function deskTabBadges(state: Readonly<GameState>): DeskTabBadges {
  const pick = state.run.repo.pick;
  const unread = inboxUnread(state).length;
  const bank = bankOf(state.run.skills);
  return {
    repository: pick !== null ? REPO_FILES[pick].name : recommendation(state) !== null ? REPO_TEXT.desk.badgeRecommended : null,
    training: bank > 0 ? TRAINING_TEXT.badge(bank) : null,
    inbox: unread > 0 ? String(unread) : null,
  };
}
