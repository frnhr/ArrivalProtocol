import type { Store } from '@state/store';
import type { GameState, RunState, TransitPlan } from '@state/schema';
import type { Segment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import type { DeskWindowId, RunMapState } from '@/types/map';
import type { ShipThreat } from '@/types/threat';
import type {
  DeliveryChip, DeliveryForecast, RepoFileId, RepoRequest, RequestStatus, RestrictedId, RunRepoState,
} from '@/types/repo';
import { REPO_FILES, repoFileSegments, repoToolKind } from '@data/repository';
import { DELIVERY_SEED_CHANCE } from '@data/tuning';
import { hopBetween } from '@systems/map-hop';
import { currentSlot, isEndSlot } from '@systems/map-streams';
import {
  firstLateness, arrivedYear, forwardLateness, receiverYear, earliestCatchUp, receiverClosed,
} from '@systems/delivery-rule';

// The repository's rules (02-map §3.8–§3.9; slice-3b-plan §2.3, §2.5), pure models and two small actions, DOM-free:
// • recommendation: ARRIVAL CONTROL's one `:) RECOMMENDED FOR YOU` tag (02 §3.8's rule order; need only, never the ETA);
// • repoModel: the REPOSITORY window's three lists for the selected destination;
// • hopOutlook: what every request (and the pick) does on a hop: in time, catches up, waiting, late or never. The ONE rule
//   the card's DELIVERIES row and TIMELINE marks, the REPOSITORY's IN TRANSIT rows, the PACKET's IN TRANSIT line and the
//   chips all read (never a second copy of it);
// • deliveriesForHop: the outlook entries that ride the hop, as chips (goTransmit puts them in TransitPlan.deliveries);
// • deliveryFirstOfKind / markFirstOfKind: which delivery is a tool kind's first this run (its licence, untried, unseeded);
// • deskWindowOnOpen: which desk tab a desk visit opens on (the last-rm prompt);
// • deliveryFiles: the chips' files (systems/draft.ts planPacket, the ONE adder, packs them beside the card's file);
// • advanceRequests: the run's requests after a send; undeliveredFiles: the RUN TALLY's `NEVER ARRIVED` line;
// • setRequest: the desk's one request per transmit.
// The patch's install at the boot is systems/delivery-boot.ts receiveDeliveryAtBoot (it needs licences.ts's REPAIR
// renewal, which this module must not import: see the cycle guard below).
// CYCLE GUARD (plan §5.4): this module never imports data/script.ts or systems/arrival-preview.ts, directly or through
// another module (script.ts → map-boot → … → repository would close a cycle; wp12/fix1/entries loads every module first).
// Track REPO owns this file after the foundation; its stubs throw `TODO(3b-REPO)` or return empty until then.

// The version of the unit's best Repair copy in `memory` (1 with none): a Repair.bak delivery arrives at it.
export function bestRepairVersion(memory: readonly Segment[]): number {
  return memory.reduce((best, seg) => (seg.type === 'fs-tool' && seg.fsTool === 'repair' ? Math.max(best, seg.version) : best), 1);
}

// The files the chips not sent on lay out, in chip order (oldest first), with ids from `makeId`: planPacket adds them to
// the packet beside the card's file, so the link, the room, the draft's room and the gate count them once (plan §2.7 item
// 2: no third adder anywhere else).
export function deliveryFiles(chips: readonly DeliveryChip[], memory: readonly Segment[], makeId: (prefix: string) => string): Segment[] {
  const repairVersion = bestRepairVersion(memory);
  return chips.filter((chip) => !chip.sendOn).flatMap((chip) => repoFileSegments(chip.file, makeId, repairVersion));
}

// ARRIVAL CONTROL's recommendation for this desk (02 §3.8, first rule that matches): the run's first desk → Mv; no Rm →
// Rm; a reachable ship within REPO_SWAP_LOOKAHEAD_LAYERS reports ENGINE FAULT and no Swap → Swap; one Repair copy or fewer
// → Repair.bak; REPO_RECOMMEND_REPAIRS_MIN repairs this run and no v2 → REPAIR v2; else none. A request in transit or
// waiting counts as owned (plan risk 4). null: none (`You have everything you need :)`), and on the classic world.
export function recommendation(state: Readonly<GameState>): RepoFileId | null {
  void state;
  return null; // TODO(3b-REPO): 02 §3.8's rule order.
}

// --- The REPOSITORY window's model (02 §4; plan §1.1 item 4) ----------------------------------------------------------

// An AVAILABLE row: the file, its ETA toward the selected destination (null with no destination selected), its tag, and
// whether it is this desk's pick.
export interface RepoRow {
  id: RepoFileId;
  name: string;
  blocks: number;
  effect: string;
  text: string;                       // `Mv · 2 BLOCKS · MOVE`
  forecast: DeliveryForecast | null;
  eta: string | null;                 // `ARRIVES 2337 · HALCYON APPROACH 2352 · IN TIME` / `4 YRS LATE → …` / NEVER
  recommended: boolean;
  requested: boolean;
  focus: boolean;                     // the last-rm prompt lights this row (04 §3.3)
}

// An IN TRANSIT row: a request still on its way (or waiting in a receiver), and what it does toward the selected
// destination (`catchesUp`: it would ride the hop there).
export interface RepoTransitRow {
  requestId: string;
  file: RepoFileId;
  name: string;
  status: Extract<RequestStatus, 'in-transit' | 'waiting'>;
  behind: number | null;              // years behind the unit (in transit), null while waiting
  at: number | null;                  // the receiver holding it (waiting)
  text: string;                       // `Swap · 4 YRS BEHIND YOU` / `Swap · WAITING IN VESPER'S RECEIVER`
  catchesUp: boolean;
}

export interface RepoRestrictedRow {
  id: RestrictedId;
  name: string;
  why: string;
}

export interface RepoModel {
  world: RunMapState['world'];        // 'classic': the window says NO REPOSITORY ON THE CLASSIC ROUTE, every list empty
  selected: number | null;            // the destination the ETAs are for (ui.deskSelected)
  pick: RepoFileId | null;
  recommended: RepoFileId | null;
  recommendLine: string | null;       // `You have everything you need :)` when nothing is recommended
  available: RepoRow[];
  inTransit: RepoTransitRow[];
  restricted: RepoRestrictedRow[];
}

// The window's model for the destination `selected` (the desk's selection; null: no ETAs yet).
export function repoModel(state: Readonly<GameState>, selected: number | null): RepoModel {
  // TODO(3b-REPO): the rows (AVAILABLE with deliveryForecast's ETA and the tag, IN TRANSIT, RESTRICTED).
  return {
    world: state.run.map.world, selected, pick: state.run.repo.pick, recommended: null, recommendLine: null,
    available: [], inTransit: [], restricted: [],
  };
}

// --- Requests (02 §3.8: one per transmit, optional, changeable until TRANSMIT ▸) ---------------------------------------

// The desk's request: `file`, or none. Desk phase only (the PACKET's ◀ CHART comes back to it; the pick survives it). A
// restricted or unknown id is a bug in the caller (the window never offers one), so it throws.
export function setRequest(store: Store<GameState>, file: RepoFileId | null): void {
  const state = store.getState();
  if (state.run.phase !== 'desk') throw new Error(`setRequest: not on the DESK (phase ${state.run.phase})`);
  if (state.run.map.world !== 'arm') throw new Error('setRequest: there is no repository on the classic route');
  if (file !== null && !Object.hasOwn(REPO_FILES, file)) throw new Error(`setRequest: '${String(file)}' is not in the catalogue (restricted rows are never sent)`);
  store.update((draft) => { draft.run.repo.pick = file; });
}

// --- The outlook: what every request does on a hop (02 §3.9) ---------------------------------------------------------

// One request's (or the pick's) fate on the hop from the current ship to `to`:
// • 'in-time': the pick, waiting in `to`'s receiver when the unit approaches (rides);
// • 'catches-up': a request in transit whose lateness reaches 0 at `to` (rides);
// • 'waiting': a request sent on, in the current ship's receiver (rides);
// • 'late': not there in time, but some route from `to` still catches it up (`SHIP d AT THE EARLIEST`: earliestDepth);
// • 'never': no route catches it up before a final ship (`to` is one, or none after it can).
// `arrivedYear` is the year it is in `to`'s receiver (a waiting request's: the year it reached the receiver it waits in);
// `yearsLate` how far behind the unit's approach at `to` (0 when it rides).
export interface OutlookEntry {
  key: string;                        // the request's id; the pick's `rq${nextId}` (DeliveryChip.key)
  file: RepoFileId;
  source: 'pick' | 'in-transit' | 'waiting';
  kind: 'in-time' | 'catches-up' | 'waiting' | 'late' | 'never';
  rides: boolean;
  arrivedYear: number;
  yearsLate: number;
  earliestDepth: number | null;       // 'late' only
}

// The outlook on the hop from `from` (the current ship) to `to`, oldest request first, the pick last. A destination the
// unit cannot reach still has an outlook (the card shows TOO LATE ships): the rule is the years, not the reach. Empty on the
// classic world. A request still in transit carries its lateness at the current ship (advanceRequests keeps it so).
export function hopOutlook(state: Readonly<GameState>, from: number, to: number): OutlookEntry[] {
  const map = state.run.map;
  if (map.world !== 'arm') return [];
  if (from !== currentSlot(state.run)) throw new Error(`hopOutlook: from slot ${from}, but the unit is at slot ${currentSlot(state.run)}`);
  const hop = hopBetween(map, from, to);
  const depth = map.route.length + 1;
  const behind = (lateness: number): Pick<OutlookEntry, 'kind' | 'rides' | 'yearsLate' | 'earliestDepth'> => {
    const catchUp = earliestCatchUp(map, to, lateness, depth);
    return catchUp === null || isEndSlot(map, to)
      ? { kind: 'never', rides: false, yearsLate: lateness, earliestDepth: null }
      : { kind: 'late', rides: false, yearsLate: lateness, earliestDepth: catchUp };
  };
  const entries: OutlookEntry[] = [];
  for (const request of state.run.repo.requests) {
    if (request.status === 'waiting') {
      if (request.at !== from || request.arrivedYear === null) throw new Error(`hopOutlook: ${request.id} waits at ${request.at}, not in this ship's receiver`);
      entries.push({ key: request.id, file: request.file, source: 'waiting', kind: 'waiting', rides: true, arrivedYear: request.arrivedYear, yearsLate: 0, earliestDepth: null });
    } else if (request.status === 'in-transit') {
      const lateness = forwardLateness(request.lateness, hop);
      const arrived = receiverYear(hop.approachYear, lateness);
      const fate = lateness <= 0 && !receiverClosed(map, to)
        ? { kind: 'catches-up' as const, rides: true, yearsLate: 0, earliestDepth: null }
        : behind(Math.max(lateness, 1));
      entries.push({ key: request.id, file: request.file, source: 'in-transit', arrivedYear: arrived, ...fate });
    }
  }
  const pick = state.run.repo.pick;
  if (pick !== null) {
    const lateness = firstLateness(map, from, to);
    const fate = lateness <= 0 && !receiverClosed(map, to)
      ? { kind: 'in-time' as const, rides: true, yearsLate: 0, earliestDepth: null }
      : behind(Math.max(lateness, 1));
    entries.push({ key: `rq${state.run.repo.nextId}`, file: pick, source: 'pick', arrivedYear: arrivedYear(map, from, to), ...fate });
  }
  return entries;
}

// Is a delivery of `file` a tool kind's first this run (02 §3.8; 04 §3.3–§3.4)? Its kind goes into run.licences, it arrives
// untried (HOLLOW leaves it alone until tried) and never carries a seed. Never for the patch (it gives no tool) and never
// for REPAIR or SCAN: Repair.bak and Scan.bak are "a spare REPAIR / SCAN" (02 §3.8). SCAN is the start kit's; REPAIR comes
// by its own first-look rule (licences.ts REPAIR_RULE), which a delivered Repair.bak must not pre-empt by licensing
// 'repair' (that would stop the main Repair file from ever coming).
export function deliveryFirstOfKind(run: Readonly<Pick<RunState, 'licences'>>, file: RepoFileId): boolean {
  const kind = repoToolKind(file);
  if (kind === null || kind === 'repair' || kind === 'scan') return false;
  return !run.licences.includes(kind);
}

// The chips with firstOfKind (and the seed chance it zeroes) set in order: only the first chip of a new kind that is not
// sent on is its first; a second chip of the same kind on the same hop is a spare. toggleSendOn re-marks after a toggle.
export function markFirstOfKind(
  run: Readonly<Pick<RunState, 'licences'>>, chips: readonly DeliveryChip[], seedChance: (chip: Readonly<DeliveryChip>) => number,
): DeliveryChip[] {
  const granted = new Set<FsToolKind>();
  return chips.map((chip) => {
    const kind = repoToolKind(chip.file);
    const first = !chip.sendOn && kind !== null && !granted.has(kind) && deliveryFirstOfKind(run, chip.file);
    if (first) granted.add(kind);
    const marked = { ...chip, firstOfKind: first };
    return { ...marked, seedChance: seedChance(marked) };
  });
}

// The deliveries that ride the hop from → toSlot, as chips, in the outlook's order (oldest first, the pick last): waiting
// ('sent-on'), caught up ('caught-up') and the pick in time ('new'). `threat` is the ladder's verdict for the destination:
// no seed rides into a calm ship (04 §3.4); nor on a first of kind or the patch; else DELIVERY_SEED_CHANCE by the hop's
// noise. None on the classic world.
export function deliveriesForHop(state: Readonly<GameState>, from: number, toSlot: number, threat: Readonly<Pick<ShipThreat, 'act'>>): DeliveryChip[] {
  const map = state.run.map;
  if (map.world !== 'arm') return [];
  const noise = hopBetween(map, from, toSlot).noise;
  const source = { pick: 'new', 'in-transit': 'caught-up', waiting: 'sent-on' } as const;
  const chips: DeliveryChip[] = hopOutlook(state, from, toSlot).filter((entry) => entry.rides).map((entry) => ({
    key: entry.key, file: entry.file, blocks: REPO_FILES[entry.file].blocks, source: source[entry.source],
    arrivedYear: entry.arrivedYear, sendOn: false, firstOfKind: false, seedChance: 0,
  }));
  return markFirstOfKind(state.run, chips, (chip) => (threat.act === 'calm' || chip.firstOfKind || chip.file === 'repair-v2' ? 0 : DELIVERY_SEED_CHANCE[noise]));
}

// The desk tab a desk visit opens on (null: the SHIP CARD): the REPOSITORY with Rm lit when the unit's last rm is gone and
// it has had DELETE (04 §3.3, round 3: the last-rm prompt). openDesk sets ui.deskWindow from it; REPO owns the rule, UI only
// draws the tab. Until REPO fills it, always the card.
export function deskWindowOnOpen(state: Readonly<GameState>): DeskWindowId | null {
  void state;
  return null; // TODO(3b-REPO): 'repository' when noWorkingRm && licences.includes('delete'), on the arm.
}

// The run's requests after the send over `plan` (plan §2.3 step 4.7): chips not sent on become delivered at the
// destination; sent on become waiting there (lost on a hop into a final ship); every other request in transit has its
// lateness reduced by the hop's slack; the pick joins as `rq${nextId}` with its first lateness, and is cleared. Pure.
export function advanceRequests(
  repo: Readonly<RunRepoState>, plan: Readonly<Pick<TransitPlan, 'toSlot' | 'hop' | 'deliveries'>>, map: Readonly<RunMapState>,
): RunRepoState {
  void repo;
  void plan;
  void map;
  throw new Error('TODO(3b-REPO): advanceRequests');
}

// The files that never reached the unit (02 §3.9: the RUN TALLY's one line): requests still in transit or waiting when
// the run ended, and those lost on a hop into a final ship. Oldest first.
export function undeliveredFiles(run: Readonly<RunState>): RepoRequest[] {
  void run;
  return []; // TODO(3b-REPO): in transit, waiting, or lost.
}
