import type { FsToolKind } from '@/types/fs-tool';

// Phase 3 slice 3b: the repository, deliveries and the INBOX (docs/phase3/impl/slice-3b-plan.md §2.2; 02-map §3.8–§3.9,
// 05-story §3.3–§3.5). Track REPO owns this file after the foundation; the INBOX's types are types/inbox.ts (Track UI).
// Everything stored on the run (RunRepoState) is JSON-safe: 3c's save writes `run.repo` whole; every chip, outlook and
// forecast re-derives from the route, the map and the requests (plan §2.6).

// --- The repository (02 §3.8) --------------------------------------------------------------------------------------

// The catalogue's rows (data/repository.ts REPO_FILES). 3c's content check reads REPO_CATALOGUE_VERSION, so an id is never
// renamed or reused: a retired file keeps its id out of the table.
export type RepoFileId = 'mv' | 'rm' | 'cp' | 'swap' | 'repair-bak' | 'scan-bak' | 'repair-v2';

export interface RepoFileDef {
  id: RepoFileId;
  name: string;                       // the file's name in memory and on every row (`Mv`, `REPAIR v2 patch`)
  blocks: number;                     // its size: link room, room, transit hits
  // The tool kind a file is a copy of (its first delivery of a kind is a licence: run.licences, untried), or the patch's
  // effect (every Repair copy becomes v2 at the boot; the patch is used up there).
  gives: FsToolKind | 'repair-v2';
  effect: string;                     // the AVAILABLE row's effect words (data/repo-text.ts)
}

// The restricted rows (02 §3.8: shown locked, never sent). Every skill is `skl:<id>` (AUTOBURN today as 'skl:autoburn';
// slice 4 adds the tree's, permanent, 03 §3.11) without a Record over a closed union.
export type RestrictedId = 'thread-plus' | 'firewall-sys' | `skl:${string}`;

export interface RestrictedRowDef {
  id: RestrictedId;
  name: string;
  why: string;                        // `Train it yourself :)`
}

// Where a request is (plan §2.3):
// • 'in-transit': behind the unit, forwarded along its route by each receiver (lateness > 0 at the last ship compared);
// • 'waiting': in a receiver the unit has reached or left (`at`), to ride the unit's next hop from there (SEND ON);
// • 'delivered': unpacked at a boot (`at`);
// • 'lost': sent on from a final ship's receiver, where no hop follows (`at`), or never caught up when the run ended
//   (undeliveredFiles reads in-transit and waiting at the end too; 'lost' is only ever written for the final hop).
export type RequestStatus = 'in-transit' | 'waiting' | 'delivered' | 'lost';

// One request, oldest first everywhere (02 §3.9: "all that catch up at one ship unpack at its boot, oldest first").
export interface RepoRequest {
  id: string;                         // `rq${n}`, n = RunRepoState.nextId at TRANSMIT ▸
  file: RepoFileId;
  fromSlot: number;                   // the hop it was requested on
  toSlot: number;
  requestedYear: number;              // A(fromSlot): the galaxy year at the desk it was asked from
  lateness: number;                   // years behind the unit at the last stop compared (> 0 while in transit)
  status: RequestStatus;
  at: number | null;                  // waiting: whose receiver holds it; delivered / lost: where; in transit: null
  arrivedYear: number | null;         // the year it reached the receiver where it caught up (null while in transit)
}

// The run's repository state (run.repo). `pick` is this desk's request until TRANSMIT ▸: it survives ◀ CHART (the kid can
// change it or clear it until the send) and is cleared by the send, which turns it into `rq${nextId}`.
export interface RunRepoState {
  pick: RepoFileId | null;
  requests: RepoRequest[];
  nextId: number;
}

// --- Deliveries on the PACKET (02 §3.9; 01 §3.16) ------------------------------------------------------------------

// One delivery packed into the hop into the ship where it caught up (TransitPlan.deliveries, plan §2.3 step 2):
// • 'new': the pick, in time at the hop's destination already (firstLateness ≤ 0);
// • 'caught-up': a request in transit whose lateness reaches 0 at this hop's destination;
// • 'sent-on': a request waiting in the receiver of the ship being left (an earlier SEND ON).
// `sendOn` is the PACKET's toggle: the chip stays in the destination's receiver to ride the unit's next hop instead (on a
// hop into a final ship there is none: the file is lost, and the tally lists it).
export interface DeliveryChip {
  // The request's id. The pick's is minted at goTransmit as `rq${RunRepoState.nextId}` (never a placeholder like 'new'),
  // so the PACKET's SEND ON, the arrival's ArrivalDelivery.key and advanceRequests' new request all name it alike.
  key: string;
  file: RepoFileId;
  blocks: number;
  source: 'new' | 'caught-up' | 'sent-on';
  arrivedYear: number;
  sendOn: boolean;
  firstOfKind: boolean;               // a tool kind new to this run: never seeded, untried on arrival (04 §3.3–§3.4)
  seedChance: number;                 // 0 (calm / first of kind / patch) or DELIVERY_SEED_CHANCE[noise]
}

// What a delivery became at the arrival (ArrivalReport.deliveries): the boot's `> DELIVERY:` lines, the patch's install
// and the untried kinds (state/initial.ts createShipSlices) read it. `segIds`: the files it laid out (one per file def).
export interface ArrivalDelivery {
  key: string;
  file: RepoFileId;
  segIds: string[];
  arrivedYear: number;
  firstOfKind: boolean;
  seeded: boolean;
}

// What the repository says of a request toward a destination (systems/delivery-rule.ts deliveryForecast; the AVAILABLE
// row's ETA): IN TIME, `n YRS LATE → FOLLOWS YOUR ROUTE · SHIP d AT THE EARLIEST` (earliestDepth: the first depth of the
// unit's run where some route could catch it up), or NEVER (`NOTHING WILL REACH YOU IN TIME`: no route catches it before
// a final ship). `arrivedYear` is the receiver year at the destination (A(S0) + |S0−SOL| + |SOL−S1|).
export type DeliveryForecast =
  | { kind: 'in-time'; arrivedYear: number; approachYear: number }
  | { kind: 'late'; arrivedYear: number; approachYear: number; yearsLate: number; earliestDepth: number }
  | { kind: 'never'; arrivedYear: number; approachYear: number; yearsLate: number };
