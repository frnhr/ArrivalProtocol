import type { Store } from '@state/store';
import type { GameState, RunState, TransitPlan, ArrivalReport } from '@state/schema';
import type { Segment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import type { DeskWindowId, RunMapState } from '@/types/map';
import type { ShipThreat } from '@/types/threat';
import type {
  ArrivalDelivery, DeliveryChip, DeliveryForecast, RepoFileId, RepoRequest, RequestStatus, RestrictedId, RunRepoState,
} from '@/types/repo';
import type { LinkNoise } from '@/types/threat';
import { REPO_FILES, REPO_FILE_IDS, RESTRICTED_ROWS, repoFileSegments, repoToolKind } from '@data/repository';
import { REPO_TEXT } from '@data/repo-text';
import {
  DELIVERY_SEED_CHANCE, REPO_RECOMMEND_REPAIRS_MIN, REPO_SWAP_LOOKAHEAD_LAYERS, REPAIR_V2_VERSION, INTEGRITY_MAX,
} from '@data/tuning';
import { hopBetween, reachable, reachableFrom } from '@systems/map-hop';
import { currentSlot, isEndSlot, armShipAt, worldSlotOf } from '@systems/map-streams';
import { layerOf } from '@systems/map-geometry';
import { oneHopFromFinal } from '@systems/map-facts';
import { hasUsableTool, toolFilesOf, isUsableTool, integrityBand, ghostBurstsThisPhase } from '@state/selectors';
import { ghostWithoutSwap } from '@systems/capabilities';
import { noWorkingRm } from '@state/threat-selectors';
import {
  firstLateness, arrivedYear, forwardLateness, receiverYear, earliestCatchUp, receiverClosed, deliveryForecast,
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
// Track REPO owns this file. lastRmPrompt and noSwapForGhost are the conditions UI's words hang on (the REPOSITORY's Rm focus,
// the strip's no-Swap ghost line); patchInstalls is the patch's verdict at its boot line.

// The version of the unit's best Repair copy in `memory` (1 with none): a Repair.bak delivery arrives at it.
export function bestRepairVersion(memory: readonly Segment[]): number {
  return memory.reduce((best, seg) => (seg.type === 'fs-tool' && seg.fsTool === 'repair' ? Math.max(best, seg.version) : best), 1);
}

// The files the chips not sent on lay out, in chip order (oldest first), with ids from `makeId`, grouped by the chip that
// carries them: planPacket adds them to the packet beside the card's file, so the link, the room, the draft's room and the
// gate count them once (plan §2.7 item 2: no third adder anywhere else), and keeps the groups (Packet.deliveries) for the
// send's seeds and its arrival report.
export function deliveryFileGroups(
  chips: readonly DeliveryChip[], memory: readonly Segment[], makeId: (prefix: string) => string,
): { key: string; segs: Segment[] }[] {
  const repairVersion = bestRepairVersion(memory);
  return chips.filter((chip) => !chip.sendOn).map((chip) => ({ key: chip.key, segs: repoFileSegments(chip.file, makeId, repairVersion) }));
}

export function deliveryFiles(chips: readonly DeliveryChip[], memory: readonly Segment[], makeId: (prefix: string) => string): Segment[] {
  return deliveryFileGroups(chips, memory, makeId).flatMap((group) => group.segs);
}

// ARRIVAL CONTROL's recommendation for this desk (02 §3.8, first rule that matches; need only, never the ETA). The order is
// data (RECOMMEND_RULES, as licences.ts's LicenceRule). "Has" is a working copy (usable and not being eaten: what will
// still be there at the next ship, as noWorkingRm judges) or a request in transit or waiting (plan risk 4). null: none
// (`You have everything you need :)`), and when nothing sent now can reach the unit before its run
// ends (review M3: a tag on a file that will never arrive; the window says `Nothing can reach you in time now`).
interface RecommendRule {
  file: RepoFileId;
  due(state: Readonly<GameState>): boolean;
}

// Slice 3b review (item 1): the Swap rule's first-desk form is for runs 2+ (a fresh roll); run 1's first desk keeps its
// authored Mv (the welcome says mv, 02 §3.14). Ship 1 has never yet been left, so the first desk is shipIndex 0.
const firstDesk = (state: Readonly<GameState>): boolean => state.run.shipIndex === 0;
const swapDue = (state: Readonly<GameState>): boolean => !hasOrComing(state, 'swap', 'swap') && engineFaultAhead(state);

export const RECOMMEND_RULES: readonly RecommendRule[] = [
  // 1. Runs 2+: the first desk asks for Swap when an ENGINE FAULT ship lies within reach (the review: following the tag,
  //    81% of ENGINE FAULT ships were reached without Swap, Mv having taken the first desk's request).
  { file: 'swap', due: (state) => firstDesk(state) && state.run.map.run > 1 && swapDue(state) },
  // 2. The first desk: Mv (only ?debug's give can bring MOVE before it).
  { file: 'mv', due: (state) => firstDesk(state) && !hasOrComing(state, 'move', 'mv') },
  // 3. No Rm.
  { file: 'rm', due: (state) => !hasOrComing(state, 'delete', 'rm') },
  // 4. An ENGINE FAULT ship the unit can reach lies within REPO_SWAP_LOOKAHEAD_LAYERS and no Swap.
  { file: 'swap', due: swapDue },
  // 5. No Mv and none coming (review M2: Mv was tagged only at the first desk, so a run whose first request went to Swap,
  //    or whose Mv was eaten, never heard of it again; debris ships need it).
  { file: 'mv', due: (state) => !hasOrComing(state, 'move', 'mv') },
  // 6. One Repair copy or fewer.
  { file: 'repair-bak', due: (state) => workingCopies(state, 'repair') + (inFlight(state, 'repair-bak') ? 1 : 0) <= 1 },
  // 7. HOLLOW is aboard, or boards on a ship within the look-ahead, and no Cp (review M2: COPY's lesson, `… IS HUNTING
  //    YOUR TOOLS — COPY your Repair`, was silent on the arm: Cp was never tagged).
  { file: 'cp', due: (state) => !hasOrComing(state, 'copy', 'cp') && hollowAhead(state) },
  // 8. REPO_RECOMMEND_REPAIRS_MIN repairs this run and no v2.
  {
    file: 'repair-v2',
    due: (state) => state.run.stats.repairs >= REPO_RECOMMEND_REPAIRS_MIN && !inFlight(state, 'repair-v2')
      && !state.memory.some((seg) => seg.type === 'fs-tool' && seg.fsTool === 'repair' && seg.version >= REPAIR_V2_VERSION),
  },
];

export function recommendation(state: Readonly<GameState>): RepoFileId | null {
  if (nothingArrives(state)) return null;
  return RECOMMEND_RULES.find((rule) => rule.due(state))?.file ?? null;
}

// What the first desk of a run on `map` recommends while the unit has none of the files (the welcome names it, so the two
// never disagree: inbox.ts): Swap on runs 2+ with an ENGINE FAULT ship in reach of ship 1, else Mv.
export function firstDeskRecommendation(map: Readonly<RunMapState>): RepoFileId {
  return map.run > 1 && shipAhead(map, map.route[0]!.slot, REPO_SWAP_LOOKAHEAD_LAYERS, engineFaultAt) ? 'swap' : 'mv';
}

// Review M3: nothing sent from this desk reaches the unit in time on any route (every reachable destination's forecast is
// NEVER: the run's last hops, where no slack is left). The forecast is the same for every file (it is the years), so the
// tag would point at a file that will never arrive.
export function nothingArrives(state: Readonly<GameState>): boolean {
  const map = state.run.map;
  const from = currentSlot(state.run);
  const destinations = isEndSlot(map, from) ? [] : reachableFrom(map, from);
  return destinations.length > 0 && destinations.every((to) => deliveryForecast(map, from, to).kind === 'never');
}

// A request for `file` still on its way (in transit, or waiting in a receiver): plan risk 4 counts it as owned. The pick
// is not on its way yet, so the tag stays on the row the kid picked.
function inFlight(state: Readonly<GameState>, file: RepoFileId): boolean {
  return state.run.repo.requests.some((request) => request.file === file && (request.status === 'in-transit' || request.status === 'waiting'));
}

function hasOrComing(state: Readonly<GameState>, kind: FsToolKind, file: RepoFileId): boolean {
  return hasUsableTool(state.memory, kind, 'excluded') || inFlight(state, file);
}

function workingCopies(state: Readonly<GameState>, kind: FsToolKind): number {
  return toolFilesOf(state.memory, kind).filter((seg) => isUsableTool(seg) && seg.infected === undefined).length;
}

// Some ship the unit can still reach from `from`, by any route, at most `layers` layers further out, passes `test`. Reach
// is the map's (in range and in time), hop by hop outward; a final ship ends a route.
function shipAhead(map: Readonly<RunMapState>, from: number, layers: number, test: (map: Readonly<RunMapState>, slot: number) => boolean): boolean {
  const limit = layerOf(worldSlotOf(map, from)) + layers;
  const seen = new Set<number>();
  let frontier = [from];
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const at of frontier) {
      if (isEndSlot(map, at)) continue;
      for (const to of reachableFrom(map, at)) {
        if (seen.has(to) || layerOf(worldSlotOf(map, to)) > limit) continue;
        seen.add(to);
        if (test(map, to)) return true;
        next.push(to);
      }
    }
    frontier = next;
  }
  return false;
}

// The ship reports ENGINE FAULT (its KNOWN PROBLEMS: the ship's modifiers).
function engineFaultAt(map: Readonly<RunMapState>, slot: number): boolean {
  return armShipAt(map, slot).modifiers.includes('engine-fault');
}

// 02 §3.8's Swap rule: an ENGINE FAULT ship within REPO_SWAP_LOOKAHEAD_LAYERS of the current one.
function engineFaultAhead(state: Readonly<GameState>): boolean {
  return shipAhead(state.run.map, currentSlot(state.run), REPO_SWAP_LOOKAHEAD_LAYERS, engineFaultAt);
}

// HOLLOW is aboard now, or a ship within the look-ahead is where it boards (one hop from a final ship: M3's forced
// boarding, map-facts.ts oneHopFromFinal) or fights (a final ship).
function hollowAhead(state: Readonly<GameState>): boolean {
  return state.run.threat.aboard
    || shipAhead(state.run.map, currentSlot(state.run), REPO_SWAP_LOOKAHEAD_LAYERS, (map, slot) => isEndSlot(map, slot) || oneHopFromFinal(map, slot));
}

// --- The REPOSITORY window's model (02 §4; plan §1.1 item 4) ----------------------------------------------------------

// An AVAILABLE row: the file, its tag, and whether it is this desk's pick. The ETA is the window's, once above the list
// (review m5: the years are the same for every file, so every row repeated it).
export interface RepoRow {
  id: RepoFileId;
  name: string;
  blocks: number;
  effect: string;
  text: string;                       // `Mv · 2 BLOCKS · MOVE`
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
  selected: number | null;            // the destination the ETAs are for (ui.deskSelected)
  pick: RepoFileId | null;
  recommended: RepoFileId | null;
  recommendLine: string | null;       // `You have everything you need :)` when nothing is recommended (`Nothing can reach you in time now`)
  forecast: DeliveryForecast | null;  // toward the selected destination (null: none selected, or TOO LATE / OUT OF RANGE)
  eta: string | null;                 // `ARRIVES 2337 · HALCYON APPROACH 2352 · IN TIME` / `4 YRS LATE → …` / NEVER
  available: RepoRow[];
  inTransit: RepoTransitRow[];
  restricted: RepoRestrictedRow[];
}

// The window's model for the destination `selected` (the desk's selection; null: no ETAs yet).
// A TOO LATE or OUT OF RANGE destination (the desk can select one to look at) gets no ETA and no IN TRANSIT verdict
// (`forecast: null`): nothing is sent toward a ship the unit will not reach. IN TRANSIT reads the one outlook rule.
export function repoModel(state: Readonly<GameState>, selected: number | null): RepoModel {
  const map = state.run.map;
  const pick = state.run.repo.pick;
  const from = currentSlot(state.run);
  const recommended = recommendation(state);
  const target = selected !== null && reachable(map, from, selected) ? selected : null;
  const forecast = target === null ? null : deliveryForecast(map, from, target);
  const targetName = target === null ? null : armShipAt(map, target).name;
  const focus = lastRmPrompt(state);
  const available = REPO_FILE_IDS.map((id): RepoRow => {
    const def = REPO_FILES[id];
    return {
      id, name: def.name, blocks: def.blocks, effect: def.effect, text: REPO_TEXT.row(def.name, def.blocks, def.effect),
      recommended: recommended === id, requested: pick === id, focus: focus && id === 'rm',
    };
  });
  const outlook = target === null ? [] : hopOutlook(state, from, target);
  const inTransit = state.run.repo.requests.flatMap((request): RepoTransitRow[] => {
    if (request.status !== 'in-transit' && request.status !== 'waiting') return [];
    const name = REPO_FILES[request.file].name;
    const catchesUp = outlook.some((entry) => entry.key === request.id && entry.rides);
    if (request.status === 'waiting') {
      if (request.at === null) throw new Error(`repoModel: ${request.id} waits in no receiver`);
      return [{
        requestId: request.id, file: request.file, name, status: 'waiting', behind: null, at: request.at,
        text: REPO_TEXT.transit.waiting(name, armShipAt(map, request.at).name), catchesUp,
      }];
    }
    const text = catchesUp && targetName !== null ? REPO_TEXT.transit.catchesUp(name, targetName) : REPO_TEXT.transit.behind(name, request.lateness);
    return [{ requestId: request.id, file: request.file, name, status: 'in-transit', behind: request.lateness, at: null, text, catchesUp }];
  });
  const restricted = RESTRICTED_ROWS.map((row): RepoRestrictedRow => ({ id: row.id, name: row.name, why: row.why }));
  return {
    selected, pick, recommended,
    recommendLine: recommended !== null ? null : nothingArrives(state) ? REPO_TEXT.window.nothingCanReach : REPO_TEXT.window.nothingToRecommend,
    forecast, eta: forecast === null || targetName === null ? null : etaText(forecast, targetName), available, inTransit, restricted,
  };
}

// An AVAILABLE row's ETA toward the ship named `ship`.
function etaText(forecast: DeliveryForecast, ship: string): string {
  switch (forecast.kind) {
    case 'in-time': return REPO_TEXT.eta.inTime(forecast.arrivedYear, ship, forecast.approachYear);
    case 'late': return REPO_TEXT.eta.late(forecast.yearsLate, forecast.earliestDepth);
    case 'never': return REPO_TEXT.eta.never;
  }
}

// --- Requests (02 §3.8: one per transmit, optional, changeable until TRANSMIT ▸) ---------------------------------------

// The desk's request: `file`, or none. Desk phase only (the PACKET's ◀ CHART comes back to it; the pick survives it). A
// restricted or unknown id is a bug in the caller (the window never offers one), so it throws.
export function setRequest(store: Store<GameState>, file: RepoFileId | null): void {
  const state = store.getState();
  if (state.run.phase !== 'desk') throw new Error(`setRequest: not on the DESK (phase ${state.run.phase})`);
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
// unit cannot reach still has an outlook (the card shows TOO LATE ships): the rule is the years, not the reach. A
// request still in transit carries its lateness at the current ship (advanceRequests keeps it so).
export function hopOutlook(state: Readonly<GameState>, from: number, to: number): OutlookEntry[] {
  const map = state.run.map;
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
// noise.
export function deliveriesForHop(state: Readonly<GameState>, from: number, toSlot: number, threat: Readonly<Pick<ShipThreat, 'act'>>): DeliveryChip[] {
  const map = state.run.map;
  const noise = hopBetween(map, from, toSlot).noise;
  const source = { pick: 'new', 'in-transit': 'caught-up', waiting: 'sent-on' } as const;
  const chips: DeliveryChip[] = hopOutlook(state, from, toSlot).filter((entry) => entry.rides).map((entry) => ({
    key: entry.key, file: entry.file, blocks: REPO_FILES[entry.file].blocks, source: source[entry.source],
    arrivedYear: entry.arrivedYear, sendOn: false, firstOfKind: false, seedChance: 0,
  }));
  return markFirstOfKind(state.run, chips, deliverySeedChance(threat, noise));
}

// A chip's seed chance on a hop into a ship with this verdict and noise (04 §3.4): none into a calm ship ("no seeds before
// depth 3"), none on a tool kind's first delivery (its lesson) or on the patch (used up at the boot), else
// DELIVERY_SEED_CHANCE by the noise. deliveriesForHop and the PACKET's SEND ON (transmit.ts toggleSendOn, which re-marks the
// first of each kind) both read it.
export function deliverySeedChance(threat: Readonly<Pick<ShipThreat, 'act'>>, noise: LinkNoise): (chip: Readonly<DeliveryChip>) => number {
  return (chip) => (threat.act === 'calm' || chip.firstOfKind || chip.file === 'repair-v2' ? 0 : DELIVERY_SEED_CHANCE[noise]);
}

// The last-rm prompt (04 §3.3, round 3): the unit has had DELETE, has no working rm now, and none is on its way
// (an Rm in transit already answers it: plan risk 4's reading, so the prompt does not nag a kid who asked). The desk then
// opens on the REPOSITORY with Rm lit.
export function lastRmPrompt(state: Readonly<GameState>): boolean {
  return state.run.licences.includes('delete') && noWorkingRm(state) && !inFlight(state, 'rm');
}

// The desk tab a desk visit opens on (null: the SHIP CARD): the REPOSITORY for the last-rm prompt. openDesk sets
// ui.deskWindow from it; REPO owns the rule, UI only draws the tab.
export function deskWindowOnOpen(state: Readonly<GameState>): DeskWindowId | null {
  return lastRmPrompt(state) ? 'repository' : null;
}

// The run's requests after the send over `plan` (plan §2.3 step 4.7), oldest first, pure:
// • a chip not sent on: delivered at the destination (its arrivedYear: the receiver year it rode from);
// • a chip sent on: waiting in the destination's receiver to ride the next hop, or lost on a hop into a final ship (no hop
//   follows; the tally lists it);
// • a request in transit with no chip: forwarded, its lateness reduced by the hop's slack (it stays in transit, and the
//   tally lists it if the run ends first);
// • the pick: as its chip says when it rode (in time), else in transit with its first lateness; it becomes `rq${nextId}`
//   and the pick is cleared.
// A waiting request always rides the next hop (deliveriesForHop): one with no chip is a bug, and throws.
export function advanceRequests(
  repo: Readonly<RunRepoState>, plan: Readonly<Pick<TransitPlan, 'toSlot' | 'hop' | 'deliveries'>>, map: Readonly<RunMapState>,
): RunRepoState {
  const to = plan.toSlot;
  const intoFinal = isEndSlot(map, to);
  const chipOf = (key: string): DeliveryChip | undefined => plan.deliveries.find((chip) => chip.key === key);
  const rode = (request: RepoRequest, chip: Readonly<DeliveryChip>): RepoRequest => ({
    ...request, lateness: 0, arrivedYear: chip.arrivedYear, at: to,
    status: !chip.sendOn ? 'delivered' : intoFinal ? 'lost' : 'waiting',
  });
  const requests = repo.requests.map((request): RepoRequest => {
    if (request.status === 'delivered' || request.status === 'lost') return { ...request };
    const chip = chipOf(request.id);
    if (chip !== undefined) return rode(request, chip);
    if (request.status === 'waiting') throw new Error(`advanceRequests: ${request.id} waits at slot ${request.at} but did not ride the hop to ${to}`);
    return { ...request, lateness: forwardLateness(request.lateness, plan.hop) };
  });
  let nextId = repo.nextId;
  if (repo.pick !== null) {
    const id = `rq${nextId++}`;
    const request: RepoRequest = {
      id, file: repo.pick, fromSlot: plan.hop.from, toSlot: to, requestedYear: plan.hop.leaveYear,
      lateness: firstLateness(map, plan.hop.from, to), status: 'in-transit', at: null, arrivedYear: null,
    };
    const chip = chipOf(id);
    requests.push(chip === undefined ? request : rode(request, chip));
  }
  const known = new Set(requests.map((request) => request.id));
  const stray = plan.deliveries.find((chip) => !known.has(chip.key));
  if (stray !== undefined) throw new Error(`advanceRequests: chip ${stray.key} (${stray.file}) is no request of the run`);
  return { pick: null, requests, nextId };
}

// The files that never reached the unit (02 §3.9: the RUN TALLY's one line): requests still in transit or waiting when
// the run ended, and those lost on a hop into a final ship. Oldest first. (Read at RUN END; mid-run it lists what has not
// arrived yet.)
export function undeliveredFiles(run: Readonly<RunState>): RepoRequest[] {
  return run.repo.requests.filter((request) => request.status !== 'delivered').map((request) => ({ ...request }));
}

// Does the REPAIR v2 patch of `delivery` install at its boot line? It installs while it crossed usable (the band every file
// works in: not below BAND_DEGRADED_MIN), judged from the transit hits that landed on it (ArrivalReport.hits: the last one
// on its file is its integrity on arrival; nothing else touches it before its line). A patch hit lower is broken: it is
// used up and installs nothing (systems/delivery-boot.ts), and its boot line makes no `EVERY REPAIR → v2` claim
// (map-boot.ts).
export function patchInstalls(arrival: Readonly<Pick<ArrivalReport, 'hits'>>, delivery: Readonly<ArrivalDelivery>): boolean {
  if (delivery.file !== 'repair-v2') throw new Error(`patchInstalls: ${delivery.file} is not the patch`);
  return delivery.segIds.every((id) => {
    const band = integrityBand(arrival.hits.filter((hit) => hit.segId === id).at(-1)?.to ?? INTEGRITY_MAX);
    return band === 'ok' || band === 'degraded';
  });
}

// The strip's no-Swap line's moment (plan risk 1; slice 3b review item 1): the engine has fired by itself on this ship (in
// this phase) and keeps firing with no Swap aboard to stop it (capabilities ghostWithoutSwap). Not only while a burst
// runs: a burst lasts a third of a second
// at CRUISE, too short for the strip ever to show the line (the review: it never won the strip).
export function noSwapForGhost(state: Readonly<GameState>): boolean {
  return ghostBurstsThisPhase(state) > 0 && ghostWithoutSwap(state);
}
