// Track REPO's store-level fixture for the slice-3b suites (map/repository, map/delivery-packet): a run on an arm flown
// desk to desk with no flights (link-over's pattern: endShip, openDesk, setCourse, a card, transmitNext), so every send is
// the real one (the packet, the deliveries, the seeds, the layout, the requests moving on) and every number stays the
// game's. Ships end 'locked' on their LANDING REPORT; nothing is flown, so nothing ticks: no licence by REPAIR's own rule
// (giveTools writes one), no HOLLOW, and the boot's lines are not said (a suite calls receiveDeliveryAtBoot itself).
import { createStore, type Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { FsToolKind } from '@/types/fs-tool';
import type { RepoFileId, RepoRequest } from '@/types/repo';
import { createInitialState } from '@state/initial';
import { createRunMap } from '@systems/map-run';
import { endShip, openDesk, transmitNext } from '@systems/run';
import { setCourseFromDesk } from '../support/desk';
import { setRequest } from '@systems/repository';
import { pickCard } from '@systems/draft';
import { transmitModel, toggleSendOn, toggleDrop } from '@systems/transmit';
import {
  unitInstallAddress, replaceRange, mergeAdjacentFree, assertMemoryInvariants, newSegId, freeSegment,
} from '@systems/memory-ops';
import { createToolFiles } from '@data/fs-tools';
import { layoutOf } from '@data/memory';
import { FIRST_RUN_LINEAGE } from '@systems/meta';

// A fresh run on the arm of run `wave` (1: run 1's authored arm; later: a fresh roll from `seed`), on ship 1's LANDING
// REPORT.
export function armRun(seed = 3, wave = 1): Store<GameState> {
  const store = createStore<GameState>(createInitialState({ seed, map: createRunMap({ wave }, seed), lineage: FIRST_RUN_LINEAGE }));
  store.update((draft) => { draft.run.phase = 'report'; });
  return store;
}

// The ship ends on its report and the desk opens (the next ship's choice).
export function toDesk(store: Store<GameState>): void {
  if (store.getState().run.phase !== 'desk') {
    endShip(store, 'locked');
    openDesk(store, null);
  }
}

// From the desk: SET COURSE to `slot` (with `ask` requested first, when given), the first card dealt picked (the +12 card
// when dealt, so no file joins the packet), every chip sent on and then files left behind while the packet is over the
// link or the room (TRANSMIT ▸ waits there), then TRANSMIT ▸. Returns the PACKET's plan as it was sent.
export function send(store: Store<GameState>, slot: number, ask: RepoFileId | null = null): GameState['run']['transit'] {
  toDesk(store);
  if (ask !== null) setRequest(store, ask);
  setCourseFromDesk(store, slot);
  const offer = store.getState().run.transit!.offer;
  if (offer.length > 0) pickCard(store, offer.some((card) => card.id === 'charge') ? 'charge' : offer[0]!.id);
  fitPacket(store);
  const plan = structuredClone(store.getState().run.transit);
  transmitNext(store);
  return plan;
}

// Sends chips on, then leaves droppable files behind, while the PACKET says the packet does not fit.
export function fitPacket(store: Store<GameState>): void {
  for (const chip of [...store.getState().run.transit!.deliveries].reverse()) {
    if (transmitModel(store.getState()).room.tooMany === null) return;
    if (!chip.sendOn) toggleSendOn(store, chip.key);
  }
  for (let guard = 0; guard < 40 && transmitModel(store.getState()).room.tooMany !== null; guard++) {
    const chip = transmitModel(store.getState()).chips.find((candidate) => candidate.toggleable && !candidate.dropped);
    if (chip === undefined) throw new Error('fitPacket: over the link or room with nothing left to leave behind');
    if (toggleDrop(store, chip.segId) !== null) throw new Error(`fitPacket: ${chip.name} would not stay behind`);
  }
}

// The run flown along `route` (from ship 1), requesting `asks[i]` at desk i; ends at the route's last ship, in its boot.
export function flyRoute(store: Store<GameState>, route: readonly number[], asks: readonly (RepoFileId | null)[] = []): void {
  for (let i = 1; i < route.length; i++) send(store, route[i]!, asks[i - 1] ?? null);
}

// The unit's tool files for `kinds` written into memory now, where a licence's go, and the kinds licensed (spared or not:
// these are the start kit's, not deliveries).
export function giveTools(store: Store<GameState>, kinds: readonly FsToolKind[]): void {
  const memory = store.getState().memory;
  for (const kind of kinds) {
    for (const file of createToolFiles(kind).map((seg) => ({ ...seg, id: newSegId(seg.id) }))) {
      const addr = unitInstallAddress(memory, file.size);
      replaceRange(memory, addr, addr + file.size, [file], { opId: null, own: [] });
    }
  }
  mergeAdjacentFree(memory);
  assertMemoryInvariants(memory, layoutOf(store.getState()).totalBlocks);
  store.update((draft) => {
    for (const kind of kinds) if (!draft.run.licences.includes(kind)) draft.run.licences.push(kind);
    draft.ui.memoryRev++;
  });
}

// Removes every file of a tool kind from memory (an eaten tool), its blocks freed.
export function dropTools(store: Store<GameState>, kind: FsToolKind): void {
  store.update((draft) => {
    draft.memory = draft.memory.map((seg) => (seg.type === 'fs-tool' && seg.fsTool === kind ? freeSegment(seg.size) : seg));
    mergeAdjacentFree(draft.memory);
    draft.ui.memoryRev++;
  });
}

// A request written straight into the run (a state the flow reaches, without flying the hops that made it).
export function addRequest(store: Store<GameState>, request: Partial<RepoRequest> & Pick<RepoRequest, 'file' | 'status'>): RepoRequest {
  const state = store.getState();
  const full: RepoRequest = {
    id: `rq${state.run.repo.nextId}`, fromSlot: 0, toSlot: 0, requestedYear: state.run.map.startYear, lateness: 0, at: null,
    arrivedYear: null, ...request,
  };
  store.update((draft) => {
    draft.run.repo.requests.push(structuredClone(full));
    draft.run.repo.nextId++;
  });
  return full;
}

export const throws = (fn: () => void): boolean => { try { fn(); return false; } catch { return true; } };
