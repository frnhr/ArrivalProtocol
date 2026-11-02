import type { Store } from '@state/store';
import type { GameState, RunState, TransitPlan } from '@state/schema';
import type { Segment } from '@/types/segment';
import type { RunMapState } from '@/types/map';
import type {
  DeliveryChip, DeliveryForecast, RepoFileId, RepoRequest, RequestStatus, RestrictedId, RunRepoState,
} from '@/types/repo';
import { REPO_FILES, repoFileSegments } from '@data/repository';

// The repository's rules (02-map §3.8–§3.9; slice-3b-plan §2.3, §2.5), pure models and two small actions, DOM-free:
// • recommendation: ARRIVAL CONTROL's one `:) RECOMMENDED FOR YOU` tag (02 §3.8's rule order; need only, never the ETA);
// • repoModel: the REPOSITORY window's three lists for the selected destination;
// • deliveriesForHop: the chips that ride a hop (goTransmit puts them in TransitPlan.deliveries);
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

// A receiver that will not hold a delivery (slice 5's RECEIVER CLOSED on a resident's ship, plan risk 14). Slice 5 decides;
// until then every receiver is open.
export function receiverClosed(map: Readonly<RunMapState>, slot: number): boolean {
  void map;
  void slot;
  return false;
}

// The deliveries that ride the hop from → toSlot, in request order (plan §2.3 step 2): every request waiting in `from`'s
// receiver ('sent-on'), every request in transit whose lateness reaches 0 at `toSlot` ('caught-up'), then the pick if it
// is in time there already ('new'). None on the classic world.
export function deliveriesForHop(state: Readonly<GameState>, from: number, toSlot: number): DeliveryChip[] {
  void from;
  void toSlot;
  if (state.run.map.world !== 'arm') return [];
  return []; // TODO(3b-REPO): the chips, with firstOfKind and seedChance.
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
