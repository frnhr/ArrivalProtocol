import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { NoiseCloud, ShipKind } from '@/types/map';
import type { LinkNoise } from '@/types/threat';
import { currentSlot, shipDefAt } from '@systems/map-run';
import { hopBetween, reachableFrom } from '@systems/map-hop';
import { shipColonists } from '@data/memory';
import { MAP_TEXT } from '@data/map-text';

// The DESK's models (02-map §3.10, §4; slice-3a-plan §2.1, §5.2), pure in the state, and its one UI action (selectShip).
// The flow's actions (openDesk, setCourse, backToChart) are systems/run.ts's: the desk only says which ship and how it
// reads. FOUNDATION STUB (F2): the types are final; the models return what the minimal desk needs (the ships in reach,
// the card's top line, the two guidance steps) and typed empty rows for the rest. Track DESK owns this file after the
// foundation (the chart's nodes, lines and states, the card's rows, the opening beat; the RUN TALLY is run-end.ts's).

// The desk's windows (02 §3.10). 3b adds the repository and the INBOX, slice 4 TRAINING (slice-3a-plan §2.10).
export type DeskWindowId = 'chart' | 'card' | 'repository' | 'training' | 'inbox';

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
  reason: string | null;    // the hover reason for a dim node (`TOO LATE BY 18 YRS`)
}

export interface ChartLine {
  from: number;
  to: number;
  noise: LinkNoise;         // solid when CLEAN, more hatched at LOW, NOISY, SEVERE
}

export interface ChartModel {
  nodes: ChartNode[];
  lines: ChartLine[];
  clouds: NoiseCloud[];
  route: number[];          // the slots visited, in order (the bright trail)
  trail046: { slot: number; year: number; colony: string | null }[];
  rings: { ly: number; label: string; next: boolean }[];
  selected: number | null;
}

// One row of the SHIP CARD (02 §4: KNOWN PROBLEMS, MEMORY and its fit line, PLANET, LZ, BEAM, SHIP n OF YOUR RUN …).
export interface CardRow {
  key: 'problems' | 'resident' | 'memory' | 'fit' | 'planet' | 'site' | 'lzs' | 'nogo' | 'beam' | 'threat' | 'norm' | 'run' | 'history';
  label: string;
  value: string;
  tone: 'plain' | 'good' | 'warn';
}

export interface CardModel {
  slot: number;
  reachable: boolean;
  top: string;              // `HALCYON · Tessaly · 1,000 COLONISTS · 5 PODS`
  tags: string[];           // `ARK`, `FINAL SHIP`
  schedule: string | null;  // `APPROACH 2352 · YOU GET THERE 2321 · 31 YRS EARLY` (null on the classic world: no years)
  rows: CardRow[];
  timeline: string | null;
}

// The guidance strip's steps on a desk (02 §4): a ship, then SET COURSE. 3b inserts the recommended file, slice 4 the
// required TRAINING pick first (slice-3a-plan §2.10).
export interface DeskStep {
  id: 'pick-ship' | 'set-course';
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

// TODO(3a-DESK): the nodes, lines, clouds, trails and rings.
export function chartModel(state: Readonly<GameState>): ChartModel {
  return { nodes: [], lines: [], clouds: [], route: state.run.map.route.map((stop) => stop.slot), trail046: [], rings: [], selected: state.ui.deskSelected };
}

// The SHIP CARD for the ship in `slot`, seen from the ship being left. TODO(3a-DESK): the schedule, the rows, the
// timeline (from hopBetween, roomFit, the landing def, seedRange, planThreat's boards, shipsLeft).
export function cardModel(state: Readonly<GameState>, slot: number): CardModel {
  const map = state.run.map;
  const ship = shipDefAt(map, slot);
  const from = currentSlot(state.run);
  hopBetween(map, from, slot);
  return {
    slot,
    reachable: deskCandidates(state).includes(slot),
    top: MAP_TEXT.card.top(ship.name, ship.world, shipColonists(ship), ship.pods),
    tags: [...(ship.kind === 'ark' ? [MAP_TEXT.card.ark] : []), ...(ship.final ? [MAP_TEXT.card.finalShip] : [])],
    schedule: null,
    rows: [],
    timeline: null,
  };
}

// The desk's guidance steps: pick a ship (done once one is selected), then SET COURSE to it.
export function deskSteps(state: Readonly<GameState>): DeskStep[] {
  const selected = state.ui.deskSelected;
  return [
    { id: 'pick-ship', text: MAP_TEXT.desk.pickShip, done: selected !== null },
    { id: 'set-course', text: selected === null ? MAP_TEXT.desk.setCourse('…') : MAP_TEXT.desk.setCourse(shipDefAt(state.run.map, selected).name), done: false },
  ];
}

// TODO(3a-DESK): the ships greyed since the last desk (their approach passed at this galaxy year).
export function deskOpeningBeat(state: Readonly<GameState>): DeskOpeningBeat {
  void state;
  return { greyed: [], line: null };
}

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
