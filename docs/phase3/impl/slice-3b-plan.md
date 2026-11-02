# Slice 3b implementation plan: the repository, deliveries and the INBOX

The architect agent wrote this from HEAD 28ddee8 on `claude/modest-hawking-209t0f`. Paths are relative to `/home/user/ArrivalProtocol`.

**Citations:** 01-landing.md (01 §n), 02-map.md (02 §n), 03-skills.md (03 §n), 04-threats.md (04 §n), 05-story.md (05 §n). DECISIONS.md wins where they differ. "The code as built" means the slice 1a, 1b, 2 and 3a plans with every Deviations section.

**Code style** follows AGENTS.md: functions and data, numbers in tuning.ts with a WHY, fail loudly, comments that say WHY.

**Lead decisions on §7's risks (2026-11-02).** All recommendations are adopted (Fran: implement the plan and measure;
the open calls resolve as it fills in). Reported to Fran with the slice: risk 1 (VESPER flown without SWAP on the
worked route, with a no-Swap strip line; the lever is the Swap rule's look-ahead), risk 7 (about 21 messages on the
worked route against 05's estimate of 10) and risk 8 (messages travel by direct light, files by 02's forward rule).
Any decision may be reverted per `DECISIONS.md`.

**Process:**
1. F (foundation: types, state, stubs with final signatures, text banners).
2. Review.
3. Tracks REPO, UI and TESTS in parallel.
4. Merge in the order REPO, UI, TESTS.
5. Full review, then fixes.
6. Unit tier (under 300 s).
7. One e2e run.

---

## 1. Scope

### 1.1 What 3b delivers

**The repository (02 §3.8, §4; 03 §3.11; 04 §3.3, M8)**

1. **Catalogue v1**, a data table:

   | File | Blocks |
   |---|---|
   | Mv | 2 |
   | Rm | 1 |
   | Cp | 3 |
   | Swap | 1 |
   | Repair.bak | 4 |
   | Scan.bak | 3 |
   | REPAIR v2 patch | 2 |

   The restricted rows are shown locked and never sent: AUTOBURN.skl (`Train it yourself :)`), THREAD+ and FIREWALL.sys. A file the unit already has arrives as a spare copy (02 §3.8).
2. **One optional request per transmit.** It can be changed or cleared until TRANSMIT ▸ (02 §3.8).
3. **ARRIVAL CONTROL's recommendation.** One `:) RECOMMENDED FOR YOU` tag, from the first rule that matches (02 §3.8; 04 M8, decision 19, no confirm):
   1. the run's first desk → Mv;
   2. no Rm → Rm;
   3. a reachable ship within two layers has ENGINE FAULT and there is no Swap → Swap;
   4. one Repair copy or fewer → Repair.bak;
   5. 5 or more repairs this run and no v2 → REPAIR v2;
   6. otherwise none: `You have everything you need :)`.
4. **The REPOSITORY desk window** (02 §4) has three lists:
   - AVAILABLE: file, size, effect, the ETA for the selected destination, the tag;
   - IN TRANSIT: `n YRS BEHIND YOU`, or waiting in a receiver;
   - RESTRICTED.

   It has one REQUEST toggle per row.
5. **The last-rm prompt** (04 §3.3, round 3). When the last rm was deleted, the next desk opens on the REPOSITORY with Rm highlighted. The `NO RM` warnings stay as built.

**Deliveries (02 §3.9; 01 §3.16; 04 §3.4)**

6. **The delivery rule.** Pure, on galaxy time and whole LY:
   - `detour = |S0−SOL| + |SOL−S1| − |S0−S1|`;
   - `lateness(S1) = detour − slack(S1)`;
   - after that, `lateness − slack(next)` at each next ship;
   - the file arrives at a receiver in `A(S0) + |S0−SOL| + |SOL−S1|`.
7. **Packing.** A delivery that catches up at S is a **delivery chip in the packet of the hop into S**:
   - it takes link room and room before the charge;
   - it can take transit hits;
   - it rolls its own seed chance.
8. **SEND ON** (02 §3.9; 01 §3.16, §5).
   - A chip toggles between going with you and staying in that ship's receiver to ride your next hop.
   - On a hop into a final ship the chip says nothing comes after, so SEND ON loses the file.
   - TRANSMIT ▸ waits while files plus deliveries plus the floor are over the room or the link.
9. **Delivery seeds** (04 §3.4; round 2, 20: hitchhikers ride free):
   - chance 0 / 10 / 25 / 40% by hop noise, at most one seed per file, and it targets the delivered file;
   - never on a tool kind's first delivery;
   - never into a calm ship ("no seeds before depth 3");
   - never on the patch (it is used up at the boot).
10. **The REPAIR v2 patch** is used up when it installs: at the boot, after REPAIR's renewal, every Repair copy becomes v2 (02 §3.8). **REPAIR v2 leaves the salvage pool** on the arm (02 §3.10, §9.5). The PACKET's draft is headed SALVAGE (3a's deferred wording).
11. **The interim licences by act are deleted** (3a's `TODO(3b)`). On the arm only REPAIR's first-look rule and `renewRepairAtBoot` stay. The classic world keeps `CLASSIC_LICENCES`, a frozen fixture.

**Boot, desk and screens (02 §4)**

12. **Boot lines** (02 §4 order, step 6):
    - `> DELIVERY: mv (arrived 2337)`, one line per file, oldest first;
    - a patch names what it upgraded;
    - beyond the third file the lines fold;
    - step 10: `> n NEW MESSAGES · INBOX`;
    - a `chime` per delivery.

    **The sleep line's year roll** (02 §4 step 2): `SLEEP_YEAR_ROLL_MS` is defined but unused today, so 3b builds it.
13. **The card:**
    - a DELIVERIES row (`Swap ✗ 4 YRS LATE`, `✓ CATCHES UP HERE`);
    - TIMELINE marks (`… 2625 ▲ approach · 2629 Swap`, green before ▲, red after);
    - the fit line counts the deliveries that would ride that hop.
14. **The PACKET:**
    - delivery chips with SEND ON;
    - an `IN TRANSIT` line;
    - deliveries in the link and room bars and in the gate.
15. **The first desk's guidance** gains the recommended-file step (02 §4: ship → file → SET COURSE; slice 4 prepends TRAINING). It guides only; SET COURSE never waits for it (decision 19).
16. **The RUN TALLY** gains one line for files that never arrived (02 §3.9, §4).

**The INBOX (05 §3.3–§3.5, §4; §8 item 3)**

17. **One INBOX model and two hosts:**
    - a desk tab, [I];
    - a flight dock window under System, with an `INBOX n` badge (05 §4: "read in flight and between ships").

    The list shows FROM, SUBJECT, RECEIVED, unread in bold. The reader shows `SENT y · RECEIVED y` stamps. Mail with no address is HOLLOW pink with a light glitch (reduced motion: a steady dim). The phone has tabs.
18. **Messages, all derived from the route and the ships**:

    | Message | When it arrives |
    |---|---|
    | The welcome | ship 1 |
    | Policy reminders | at the boots crossing rings 2 and 4 |
    | The arm-complete letter | the final ship's boot |
    | CONTROL's replies | one per ended non-final ship, size 0, by light from SOL |
    | Colony postcards | at colony years 1, 50 and 200, joined per colony per boot |
    | 046's no-address mail | the boots crossing rings 3 and 5 |
    | Run 1's MERIDIAN letter to 046 | the first instance of "letters to the unit ahead"; 05 §3.3 |
19. **`> you're reading my log. good. read it slowly.`**, said once a run, at the first boot after entry 05 is read (05 §3.5; 3a review deviation 14).

### 1.2 Not in 3b

**3c:**
- the run save (it saves `run.repo` and `run.inbox.read`; everything else re-derives);
- archive v2;
- letters to the unit ahead from the last unit's colonies (3b's letter source is a seam);
- the world update.

**Slice 4:**
- TRAINING (the `T` tab, the required first pick);
- the tree's `.skl` rows in RESTRICTED;
- RESTORE at half price (decision 16; 03 §3.3 is TRAINING's, not the repository's);
- PACK AS v1;
- the `+2 CYCLES` salvage card;
- SENTRY: disguised seeds, FIREWALL compiled by `installAddress`;
- `unlink` on skills.

**Slice 5:**
- residents' notes and signal mail (SCAN `SIGNAL · 2/3`);
- a left resident's leftovers replacing salvage;
- whether `RECEIVER CLOSED` affects deliveries (a seam).

**Slice 7:** the epilogue's letters, trace places.

**Later:**
- mirrors (02 §3.9);
- repository receipts as mail (05 §8.4; risk 9);
- desk one-liners for "the first late delivery".

**The classic world gets no repository and no INBOX.** The window says `NO REPOSITORY ON THE CLASSIC ROUTE` and the boot plans are unchanged. Its fixture hops have slack 0, so every request would read NEVER, and the classic suites count boot lines.

### 1.3 Open calls 3b resolves

| Call | 3b |
|---|---|
| 3a risk 3, the interim licences | **Resolved:** deleted. Tools come only by request (or `__ap.give`). |
| 3a risk 17, salvage vs `◀ CHART` | **Resolved:** the deal stays keyed by the slot left, counts the deliveries as first packed, and `◀ CHART` forgets drops, pick and SEND ON. SALVAGE heading. |
| 3a review deviation 14, the reading line | **Built** (item 19). |
| 3a foundation M2 (files + floor ≤ room) | Deliveries count as files in the room gate and the link gate. |
| 04 §8.4 / slice-2 plan line 100 (repository items) | Delivery seeds, the Rm recommendation and last-rm → REPOSITORY are built. Skill restores go to slice 4. |
| 3a DESK note, `SLEEP_YEAR_ROLL_MS` unused | **Built** (item 12). |

---

## 2. Architecture

### 2.1 Module map (new modules in bold)

| Module | Kind | Owner after F | Responsibility |
|---|---|---|---|
| **`src/types/repo.ts`** | types | REPO | §2.2's types |
| **`src/data/repository.ts`** | data | REPO | `REPO_FILES` (id, name, blocks, gives, segment builder), `RESTRICTED_ROWS`, `REPO_CATALOGUE_VERSION` (3c's content check), `validateCatalogue()` at load |
| **`src/systems/delivery-rule.ts`** | pure | F real → REPO | `detourYears`, `firstLateness`, `arrivedYear`, `forwardLateness`, `deliveryForecast`, `lightArrival` (messages) |
| **`src/systems/repository.ts`** | pure + actions | REPO | `recommendation`, `repoModel`, `deliveriesForHop`, `advanceRequests`, `undeliveredFiles`, `deliveryFiles`; actions `setRequest`, `receiveDeliveryAtBoot` |
| `src/systems/run.ts` | stateful | REPO | `goTransmit` (deliveries in the plan), `transmitNext` (pack, seeds, requests advance, licences), `openDesk` (last-rm window) |
| `src/systems/transmit.ts` | pure + action | REPO | `TransmitModel.deliveries`, `inTransit`, `salvageTitle`; `toggleSendOn` |
| `src/systems/draft.ts`, `src/data/upgrades.ts` | pure | REPO | `PacketPlan.deliveries` (planPacket is the ONE adder); `draftContext` counts delivery blocks; `UpgradeDef.salvage` (REPAIR v2 `false`; the arm deals salvage-only) |
| `src/systems/beam-seeds.ts` | pure | REPO | `rollBeamSeeds(…, excludeIds)`, so beam seeds never ride a delivered file; `rollDeliverySeeds` |
| `src/systems/arrival-preview.ts` | pure | REPO | `ArrivalPlan.deliveries`; delivery seeds in `seedBlocksMax`; the one preview |
| `src/systems/licences.ts` | stateful | REPO | delete `armLicenceRules`; `licenceSchedule(…, 'arm') = [REPAIR_RULE]` |
| `src/systems/map-boot.ts`, `src/systems/boot.ts` | stateful | REPO | `deliveryBootLines(state)`; boot.ts passes the line's ordinal and calls `receiveDeliveryAtBoot` on each `'delivery'` line |
| `src/state/initial.ts` | pure | REPO | `createShipSlices` seeds `hollow.untriedTools` from `run.arrival.deliveries` (first-of-kind tools only) |
| **`src/systems/inbox.ts`** | pure + action | UI | `inboxMessages`, `newMessagesAtBoot`, `inboxUnread`, `markMessageRead` |
| **`src/data/repo-text.ts`**, **`src/data/inbox-text.ts`** | text | F → UI | every 3b string, `PLACEHOLDER(05)` banner |
| `src/systems/desk.ts` | pure | UI | DELIVERIES row, TIMELINE marks, `deskSteps` with `'request'`, `deskWindowOnOpen` |
| **`src/components/desk/{DeskTabs,RepositoryWindow,InboxView}.ts`** | view | UI | the right column becomes tabs CARD / REPOSITORY [R] / INBOX [I] (badges); phone tabs in the sheet |
| **`src/components/run/InboxWindow.ts`** | view | UI | the flight dock window hosting InboxView (`.inbox-win`; ToolsTabs entry `inbox`) |
| `src/components/run/TransmitScreen.ts` | view | UI | the DELIVERIES chip row, SEND ON, IN TRANSIT line, SALVAGE heading |
| `src/components/memory-view/MindTerminal.ts` | view | UI | the sleep line's year roll (SLEEP_YEAR_ROLL_MS, tick ratchet) |
| `src/data/script.ts` | data | UI | renders `'delivery'`/`'inbox'`/`'reading'`; `BOOT_LINE_MAX`; the no-Swap ghost line (risk 1) |
| `src/systems/run-end.ts`, `RunEnd.ts` | pure/view | UI | the `NEVER ARRIVED` tally line |
| `src/systems/story-log.ts`, `src/state/log-selectors.ts` | stateful/pure | UI | `readingLineDue`, `run.log.toldReading` |
| `src/data/map-text.ts`, `src/styles/desk.css`, `game.css` (append), `audio-cues.ts`, `index.html` (dock item) | | UI | |

### 2.2 Type sketches (`src/types/repo.ts`)

```ts
export type RepoFileId = 'mv' | 'rm' | 'cp' | 'swap' | 'repair-bak' | 'scan-bak' | 'repair-v2';

export interface RepoFileDef {
  id: RepoFileId; name: string; blocks: number;
  gives: FsToolKind | 'repair-v2';     // the tool kind a file is a copy of; the patch's effect
  effect: string;                      // repo-text
}

export type RequestStatus = 'in-transit' | 'waiting' | 'delivered' | 'lost';

// JSON-safe (3c saves it whole). Oldest first everywhere (02 §3.9: "unpack at its boot, oldest first").
export interface RepoRequest {
  id: string;                 // `rq${n}`, n = RunRepoState.nextId at TRANSMIT ▸
  file: RepoFileId;
  fromSlot: number; toSlot: number;   // the hop it was requested on
  requestedYear: number;      // A(fromSlot)
  lateness: number;           // years behind you at the last stop compared (> 0 while in transit)
  status: RequestStatus;
  at: number | null;          // waiting: whose receiver holds it; delivered / lost: where
  arrivedYear: number | null; // the year it reached the receiver where it caught up
}

export interface RunRepoState {
  pick: RepoFileId | null;    // this desk's request, until TRANSMIT ▸ (survives ◀ CHART)
  requests: RepoRequest[];
  nextId: number;
}

export interface DeliveryChip {        // TransitPlan.deliveries
  key: string;                         // a request id, or 'new' (the pick)
  file: RepoFileId;
  blocks: number;
  source: 'new' | 'caught-up' | 'sent-on';
  arrivedYear: number;
  sendOn: boolean;                     // the PACKET toggle; on a hop into a final ship it means lost
  firstOfKind: boolean;                // a new tool kind for this run: never seeded, untried on arrival
  seedChance: number;                  // 0 (calm / first of kind / patch) or DELIVERY_SEED_CHANCE[noise]
}

export interface ArrivalDelivery {     // ArrivalReport.deliveries: the boot's lines, the patch, untriedTools
  key: string; file: RepoFileId; segIds: string[]; arrivedYear: number; firstOfKind: boolean; seeded: boolean;
}

export type DeliveryForecast =
  | { kind: 'in-time'; arrivedYear: number; approachYear: number }
  | { kind: 'late'; arrivedYear: number; approachYear: number; yearsLate: number; earliestDepth: number }
  | { kind: 'never'; arrivedYear: number; approachYear: number; yearsLate: number };

export type MessageKind = 'welcome' | 'policy' | 'arm-complete' | 'reply' | 'postcard' | 'letter' | 'no-address';
export interface InboxMessage {
  id: string;                 // stable: 'welcome', 'reply:<slot>', 'postcard:<slot>:<depth>', 'noaddr:3', 'letter:meridian'
  kind: MessageKind;
  from: string;               // FROM ARRIVAL CONTROL · EARTH / RIVERSIDE · Kepler-186f / (no address)
  sentYear: number | null;    // null: SENT ????
  receivedYear: number;
  readAtDepth: number;        // the boot it arrives at (route index + 1)
  subject: string;
  body: string[];             // ≤ INBOX_BODY_MAX_LINES lines of ≤ 70 chars
  tag: string | null;         // FOR UNIT-046
  tone: 'control' | 'colony' | 'hollow';
}
export interface RunInboxState { read: string[] }
```

**Schema edits** (F; `src/state/schema.ts`):
- `RunState.repo: RunRepoState`, `RunState.inbox: RunInboxState`;
- `TransitPlan.deliveries: DeliveryChip[]` (`[]` on the classic world);
- `ArrivalReport.deliveries: ArrivalDelivery[]`;
- `RunLogState.toldReading: boolean`.

`ui.deskWindow` already exists: null means the card; `'repository'` and `'inbox'` are the tabs. `UpgradeKind` gains `'repair-patch'` (the patch's segment, risk 6). `events.ts` gains `'delivery': { file: RepoFileId }`.

**`run.licences` changes meaning** to "the tool kinds that have reached the unit this run". `installTool`'s second-install throw stays for licences. Deliveries never call it.

### 2.3 Request → chip → crossing → boot

1. **Desk.**
   - `setRequest(store, file | null)` writes `run.repo.pick` (desk phase only; a restricted id throws).
   - `repoModel(state, ui.deskSelected)` gives each row's ETA from `deliveryForecast(map, current, selected)`.
   - IN TRANSIT rows read each request's `lateness` and, for the selected destination, `forwardLateness(lateness, hop)`.
2. **`goTransmit(store, toSlot)`** puts `deliveries: deliveriesForHop(state, from, toSlot)` in the plan. Pure, in request order:
   - every `'waiting'` request at `from` (`sent-on`);
   - every `'in-transit'` request with `forwardLateness ≤ 0` (`caught-up`);
   - the pick, if `firstLateness ≤ 0` (`new`).

   `planPacket` adds each chip that is not sent on via `deliveryFiles(chips, makeId)` beside `cardFiles(pick)`, so the link, the room, the draft and the gate see them once. `dealDraft` counts their blocks.
3. **PACKET.** `toggleSendOn(store, key)` updates the chip and the plan's `filesBlocks` / `chargeCarried`. `unitArrival(state, { hop, threat, dropped, pick, deliveries })` drives every number.
4. **`transmitNext`:**
   1. `planPacket` builds the packet, with real ids.
   2. `rollBeamSeeds(packet, source, firstRun, rng, excludeIds = delivered seg ids)` keeps its stream `'beam-seeds'`.
   3. `rollDeliverySeeds(chips, packet, hopRng(run, from, to, 'delivery-seeds'))` makes one chance draw and one words draw per chip, in order.
   4. Both seed lists go into `packet.seeds`.
   5. The existing preview equals layout assert, with `seedsExact = beam + delivery seeds`.
   6. Transit hits, charge and `layoutCarried` run unchanged. Delivered files are ordinary unit files: fs-tools sort into rack F; the patch is an upgrade file in rack E.
   7. `store.update`:
      - `run.repo = advanceRequests(run.repo, plan, hop)`: chips IN become delivered, sent on becomes waiting at `toSlot` (lost on a final hop), others in transit have their `lateness` reduced, and the pick joins as `rqN`;
      - `run.licences ∪= first-of-kind kinds`.
   8. `startShip` with `arrival.deliveries`.
5. **Boot.**
   - `createShipSlices` sets `hollow.untriedTools` to the first-of-kind tool kinds (04 §3.3: the lesson is never eaten; spares are not untried).
   - The plan has one `'delivery'` line per `ArrivalDelivery` (fold at `DELIVERY_BOOT_LINES_MAX`).
   - When a `'delivery'` line is said, boot.ts calls `receiveDeliveryAtBoot(store, ordinal)`: emit `'delivery'` (chime, chip slide). For the patch: `renewRepairAtBoot(store)` first (idempotent; the later `'charge'` call becomes a no-op), then every Repair copy goes to v2 and the patch's blocks are freed, with `mergeAdjacentFree` and the invariants. `run.upgrades` gets `'repair-v2'`, so the Skills window lists it.
   - `finishBoot` says every planned line, so a skip still installs the patch.
6. **Run end.** `undeliveredFiles(run)`: in transit, waiting, or lost on the final hop. This is the tally's one line.

**Where deliveries land in memory.** They are files in `fillRoom`, so the gate (files + deliveries + floor ≤ room) makes 01 §3.16's "files, floor, deliveries" order equal in every number. Delivered tools sit with the unit's tools, not after the floor. This is a cosmetic deviation, recorded.

### 2.4 Messages: derived, not queued

`inboxMessages(state): InboxMessage[]` is pure. It is built from the route, `run.ships` (colony, landed, featured), the map, 046's written trail and `lineage`, up to the current stop. Stored state is only `run.inbox.read` and `run.log.toldReading`.

**One light rule for messages**, `lightArrival(map, sourceXY, sentYear, route, afterDepth)`. A message sent from P in year T is read at the first route stop X after the sending stop with `A(X) ≥ T + |P − X|`; RECEIVED is `T + |P − X|`. This is 05 §3.3's postcard rule, and it reproduces every 05 §3.12 stamp:
- the welcome: 2280 → 2288;
- the KESTREL reply: 2522 → 2651 at CORMORANT;
- RIVERSIDE: 2301 → 2322 at HALCYON;
- the arm-complete letter: 2280 → 2460.

**Files keep 02 §3.9's request-and-forward rule.** That rule and its profile were simulated; a reply has no named destination to forward from. This reading is recorded as a deviation for 05/02's owner.

**Sources (05 §3.3):**
- **Broadcasts:**
  - the welcome at depth 1;
  - policy reminders at the boots that cross rings 2 and 4;
  - the arm-complete letter at a final ship's boot;
  - all sent `startYear − WELCOME_SENT_BEFORE_START_YEARS`, RECEIVED = sent + solLy(ship).
- **Replies:** one per ended non-final ship, sent from SOL at `A(S) + solLy(S)`. A reply read two or more ships after its ship uses the stale greeting (`Dear Unit 46`), a deterministic form of 05's running joke.
- **Postcards:** per `ShipResult` with `landedInLz > 0`, at colony years 1, 50 and 200 from its world. Two at one boot are joined. They are written from `colony` and the first featured colonist.
- **No-address mail:** at the boots crossing rings 3 and 5. RECEIVED = the year the beam crossed the ring (risk 8).
- **Letters:** run 1's MERIDIAN (Marrow, landed 2350) to 046, at colony year 1. `letterSources(run)` is the seam 3c fills from archive v2.

`newMessagesAtBoot(state)` = messages with `readAtDepth === shipIndex + 1`. The boot plan reads it for `> n NEW MESSAGES · INBOX`, after the `log` line. The `'reading'` line is HOLLOW pink, once a run, before the `log` line, due when entry 05 is read and `toldReading` is false. story-log marks it as it is said.

### 2.5 Pure versus stateful

**Pure (no store):**
- delivery-rule.ts;
- repository.ts's models and `advanceRequests`;
- `deliveriesForHop`, `deliveryForecast`, `recommendation`;
- inbox.ts's derivation;
- the desk card's DELIVERIES row and TIMELINE marks;
- all text.

A suite can run §3.14's delivery table, a 50-arm forecast profile and the worked route's mail with no store.

**Stateful:**
- `setRequest`, `toggleSendOn`;
- `goTransmit`, `transmitNext`, `openDesk`;
- `receiveDeliveryAtBoot`;
- `markMessageRead`, story-log's reading flag;
- the views.

### 2.6 Seams (named in code comments)

- **3c:**
  - `RunRepoState` and `RunInboxState` are JSON-safe. Save `repo` whole and `inbox.read`; messages re-derive.
  - `REPO_CATALOGUE_VERSION` joins the save's content check (02 §3.11).
  - `letterSources(run)` takes archive v2's last-unit colonies (`FOR UNIT-047`).
- **Slice 4:**
  - `RESTRICTED_ROWS` gains the tree's `.skl` (permanent, 03 §3.11);
  - the `'training'` tab and [T];
  - `deskSteps` prepends the TRAINING pick;
  - `planPacket` remains the one adder, so PACK AS v1 plugs in there;
  - `UpgradeDef.salvage` admits `+2 CYCLES`;
  - SENTRY's FIREWALL uses `installAddress`.
- **Slice 5:**
  - `MessageKind` gains `'note' | 'signal' | 'old-colony'`;
  - `inboxMessages` takes event sources;
  - `deliveriesForHop` keeps a `receiverClosed(map, slot)` hook, returning false until slice 5 decides.
- **Slice 7:** the arm-complete letter's `[UNIT]` field, the epilogue letters.

### 2.7 Architecture debt

**Fix in 3b:**
1. Delete the arm's interim licence schedule.
2. Make `planPacket` the single "files added to the packet" path: the card and the deliveries. No third adder in transmit or preview.
3. Make `rollBeamSeeds` ID-excluding instead of silently able to double up on a delivered file. layoutCarried throws on two seeds behind one file.
4. DeskScreen's two hard-coded step elements become a steps list.
5. Build the year roll behind `SLEEP_YEAR_ROLL_MS` (today the constant has no reader).
6. Document `run.licences`' new meaning in schema.ts.
7. `bootLine(kind, state, vars, ordinal = 0)` replaces "one line per kind": repeated delivery lines need it.

**Leave alone:**
- the parked refactors (script.ts, game.css, tuning grouping: append blocks only);
- archive v1;
- the classic world's licences and draft;
- predict / orbit / hollow internals.

---

## 3. The player's walk (run 1, the worked route)

1. **ARES-VII boot.** After the ECC line, `> 1 NEW MESSAGE · INBOX`; the dock shows `INBOX 1`. The welcome (`SENT 2280 · RECEIVED 2288`) ends `Need software? Ask our repository. Recommended for you: mv :)`. The flight and landing play as built. There is no MOVE licence any more.
2. **First desk** (2300). The strip shows `1 SHIP · 2 FILE · 3 SET COURSE`. The kid clicks HALCYON, and the strip says `REQUEST mv · RECOMMENDED [R]`. [R] opens the REPOSITORY tab:
   - `Mv · 2 BLOCKS · MOVE · ARRIVES 2337 · HALCYON APPROACH 2352 · IN TIME :) RECOMMENDED FOR YOU`;
   - the RESTRICTED rows are locked.

   The kid presses REQUEST. The card's TIMELINE gains `2337 Mv` in green.
3. **PACKET** (to HALCYON). A DELIVERIES row shows `Mv · 2 BLOCKS · ARRIVED 2337 · [SEND ON]`. The link bar reads `FILES 67`. The draft is headed SALVAGE, with no REPAIR v2 card. TRANSMIT ▸.
4. **HALCYON boot.** In order:
   - `> ASLEEP IN HALCYON'S RECEIVER · 2321 → 2352 · 31 YEARS`, the year rolling;
   - the unpack and ECC lines;
   - `> DELIVERY: mv (arrived 2337)` with a chime, and the MOVE chip slides in, untried;
   - charge;
   - `> 046.log · KEY FOUND …`;
   - `> 2 NEW MESSAGES · INBOX`: CONTROL's reply to ARES-VII, and RIVERSIDE's `we're down!` (`SENT 2301 · RECEIVED 2322`).
5. **HALCYON desk.** Rm is tagged. `Rm · ARRIVES 2436 · KESTREL APPROACH 2467 · IN TIME`. KESTREL's packet carries an Rm chip, and KESTREL's seed lesson has its rm.
6. **KESTREL desk.** Swap is tagged (VESPER, ENGINE FAULT, two layers out). VESPER's card says `DELIVERIES · Swap ✗ 4 YRS LATE`, and its TIMELINE reads `… 2625 ▲ approach · 2629 Swap` in red. The REPOSITORY says `4 YRS LATE → FOLLOWS YOUR ROUTE · SHIP 5 AT THE EARLIEST`. The kid requests it anyway and flies VESPER without SWAP (risk 1).
7. **VESPER desk.** IN TRANSIT shows `Swap · 4 YRS BEHIND YOU`. CORMORANT's card says `Swap ✓ CATCHES UP HERE`. The kid requests Cp (`44 YRS LATE → … SHIP 6`). VESPER's boot brought the ring-3 no-address mail in pink.
8. **CORMORANT desk.** Every row says `NOTHING WILL REACH YOU IN TIME`. If a seed ate the last rm, this desk opened on the REPOSITORY with Rm lit.
9. **LAST LIGHT.**
   - Its packet carries Cp.
   - The boot shows `> DELIVERY: cp (arrived 2861)` and the arm-complete letter.
   - The RUN TALLY lists `NEVER ARRIVED: —` (or the files that didn't).

---

## 4. Data

### 4.1 The catalogue (`src/data/repository.ts`; repo-text words)

| Id | File | Blocks | Gives | Segment |
|---|---|---|---|---|
| mv | Mv | 2 | MOVE | `createToolFiles('move')`, fresh id |
| rm | Rm | 1 | DELETE | `createToolFiles('delete')` |
| cp | Cp | 3 | COPY | `createToolFiles('copy')` |
| swap | Swap | 1 | SWAP | `createToolFiles('swap')` |
| repair-bak | Repair.bak | 4 | a spare REPAIR | the `t_repair_bak` def, at the version of the unit's best Repair copy |
| scan-bak | Scan.bak | 3 | a spare SCAN | new def `Scan.bak` (fs-tool scan) |
| repair-v2 | REPAIR v2 patch | 2 | every Repair copy becomes v2 | `UpgradeSegment` `upgrade: 'repair-patch'`, used up at the boot |

**Restricted:** AUTOBURN.skl (`Train it yourself :)`), THREAD+, FIREWALL.sys. Every file is offered from the first desk; there is no depth gate (02 has none).

**`validateCatalogue`** checks:
- the sizes against `TOOL_FILES`;
- a gives-kind for every tool file;
- the 70-character rule;
- the locked-floor check (arrival-preview's) still passes.

### 4.2 The delivery rule's numbers (02 §3.14; `map/delivery-rule` pins every cell)

| Requested at | File | Detour | First ship | Then | Arrives (receiver) |
|---|---|---|---|---|---|
| ARES-VII 2300 | Mv | 8+29−21 = 16 | HALCYON −15, in time | | 2337 at HALCYON |
| HALCYON 2352 | Rm | 29+55−26 = 58 | KESTREL −31 | | 2436 |
| KESTREL 2467 | Swap | 55+107−55 = 107 | VESPER +4 (2629 > 2625) | CORMORANT 4−162 | 2659 at CORMORANT |
| VESPER 2625 | Cp | 107+129−30 = 206 | CORMORANT +44 | LAST LIGHT 44−149 | 2861 at LAST LIGHT |
| CORMORANT 2817 | any | 129+180−54 = 255 | LAST LIGHT +106 | none | NEVER |

**Tuning block `3b REPO`** (each with its WHY):
- `DELIVERY_SEED_CHANCE = { 0: 0, 1: 0.1, 2: 0.25, 3: 0.4 }` (04 §3.4);
- `DELIVERY_BOOT_LINES_MAX = 3` (beyond it one folded line: the boot stays under 20 s);
- `REPO_RECOMMEND_REPAIRS_MIN = 5`;
- `REPO_SWAP_LOOKAHEAD_LAYERS = 2` (02 §3.8).

**Profile.** INFO only, against 02 §3.9's table, over 50 fresh arms with random routes in quick depth. The full 200 arms run in `npm run balance`.

### 4.3 Messages on the worked route (if every ship lands someone; `map/inbox` pins these)

| Boot | Messages (05's words are placeholders) |
|---|---|
| ARES-VII | welcome (2280 / 2288) |
| HALCYON | reply to ARES-VII (2308 / 2337); RIVERSIDE y1 (2301 / 2322) |
| KESTREL | reply to HALCYON (2381 / 2436); RIVERSIDE y50 (2350 / 2397); HALCYON's colony y1 + y50 joined; MERIDIAN → 046 (2351 / 2380); policy (ring 2) |
| VESPER | RIVERSIDE y200 (2500 / 2600); KESTREL's colony y1 + y50; no-address (ring 3); policy (ring 4) |
| CORMORANT | reply to KESTREL (2522 / 2651, `Dear Unit 46`); HALCYON's colony y200; KESTREL's y200; VESPER's y1 + y50; no-address (ring 5) |
| LAST LIGHT | reply to VESPER (2732 / 2912); VESPER's y200; CORMORANT's y1 + y50; arm-complete (2280 / 2460) |

There are about 21 messages. 05 §3.3 estimated 10 (risk 7).

**Tuning block `3b UI`:**
- `WELCOME_SENT_BEFORE_START_YEARS = 20` (05 §3.12's 2280);
- `POSTCARD_COLONY_YEARS = [1, 50, 200]`;
- `INBOX_BODY_MAX_LINES = 6`;
- `BOOT_LINE_MAX` 13 → 18 (3 delivery lines + inbox + reading), and `BOOT_LINE_AT_SEC` gains 5 times at the same rhythm (boot.ts's load check).

### 4.4 Stamps and texts

- **Stamps:** `SENT 2522 · RECEIVED 2651`; `SENT ???? · RECEIVED 2481` for no-address mail; joined postcards show the first SENT and the last RECEIVED.
- **Bodies:** 05 §3.12's samples are the first drafts. Every template is `PLACEHOLDER(05)`, with its 70-character worst case in `map/text`.
- **Postcard progress lines:** 05's 80 per-bio lines are 05's work. 3b ships one placeholder per colony year, not per bio (risk 10).

---

## 5. Work breakdown

### 5.0 FOUNDATION (one agent, one commit; typecheck and every suite green)

1. **Types.** `src/types/repo.ts`. Schema fields per §2.2. `createRunState` initialises `repo: { pick: null, requests: [], nextId: 1 }` and `inbox: { read: [] }`. `toldReading: false`. `deliveries: []` in every TransitPlan / ArrivalReport literal: run.ts, debug.ts, and the 3 test files that build one (lead-approved mechanical edits). `UpgradeKind 'repair-patch'` with each exhaustive site stubbed (about 7; the compiler lists them). `'delivery'` event.
2. **Real `src/systems/delivery-rule.ts`** (about 60 lines; both tracks need true numbers, as 3a's hop math) and **real `src/data/repository.ts`**.
3. **Stubs with final signatures that throw `TODO(3b-REPO)` / `TODO(3b-UI)` or return empty:**
   - repository.ts (`deliveriesForHop` returns `[]`, `repoModel` typed empty rows, `recommendation` null);
   - inbox.ts (`inboxMessages` returns `[]`);
   - `toggleSendOn`, `receiveDeliveryAtBoot`, `rollDeliverySeeds` (`[]`), `undeliveredFiles` (`[]`).
4. **Wiring, done once:**
   - `PacketPlan.deliveries` and `ArrivalPlan.deliveries` threaded (empty);
   - `bootLinePlan` places `'delivery'` (from `deliveryBootLines`), `'inbox'` (from `newMessagesAtBoot`) and `'reading'` (from `readingLineDue`), arm only;
   - `bootLine(…, ordinal)`;
   - boot.ts ordinal plumbing.
5. **Text.** `repo-text.ts` and `inbox-text.ts` with every 3b string, `PLACEHOLDER(05)` banners.
6. **Tuning.** Blocks `3b REPO` and `3b UI`.
7. **Debug.** `__ap.request(file)`, `__ap.repo()`, `__ap.inbox()`, `__ap.give(file)` (writes a repository file now via `installAddress`, recording the licence and untried kind).
8. **Desk.** `DeskStep['id']` gains `'request'`; `CardRow['key']` gains `'deliveries'`.

### 5.1 Track REPO (the rule in play)

Owns:
- `types/repo.ts`, `data/repository.ts`, `systems/delivery-rule.ts`, `systems/repository.ts`;
- `run.ts`, `transmit.ts` (model and `toggleSendOn`), `draft.ts`, `upgrades.ts`, `beam-seeds.ts`, `carry.ts` (if needed), `arrival-preview.ts`, `licences.ts`, `map-boot.ts`, `boot.ts`, `state/initial.ts`, `debug.ts`;
- tuning `3b REPO`.

1. `recommendation` (02 §3.8 order; an in-flight request counts as owned, risk 4), `repoModel`, `setRequest`.
2. `deliveriesForHop`, `deliveryForecast` (a BFS over reachable hops by depth; NEVER at a final ship), `advanceRequests`, `undeliveredFiles`.
3. The flow, as §2.3:
   - goTransmit's chips, planPacket's adder, draftContext's blocks;
   - transmitNext's seeds, assert, licences and requests;
   - `toggleSendOn` (on a final hop it marks the file lost);
   - openDesk sets `ui.deskWindow = 'repository'` when `noWorkingRm && licences.includes('delete')`.
4. Delivery seeds: `rollDeliverySeeds`, beam-seed exclusion, the preview's `seedBlocksMax`.
5. The patch: `receiveDeliveryAtBoot` (renew, then v2, free the blocks). REPAIR v2 leaves the arm's salvage pool (`UpgradeDef.salvage`; the classic world unchanged).
6. Delete `armLicenceRules`. Seed `untriedTools` from arrivals.
7. `deliveryBootLines` and their texts' calls (repo-text, by request to UI).

### 5.2 Track UI (desk windows, PACKET, INBOX, boot words)

Owns:
- `systems/inbox.ts`, `data/inbox-text.ts`, `data/repo-text.ts`, `data/map-text.ts`, `data/script.ts`;
- `systems/desk.ts`, `components/desk/*`, `components/run/{TransmitScreen,InboxWindow,RunEnd}.ts`, `systems/run-end.ts`;
- `MindTerminal.ts`, `ToolsTabs.ts`, `index.html` (the dock item), `story-log.ts`, `log-selectors.ts`, `audio-cues.ts`, `styles/*`;
- tuning `3b UI`.

1. Desk tabs: CARD / REPOSITORY [R] / INBOX [I] with badges, `ui.deskWindow`, Escape back to the card. The phone sheet has tabs. Number keys 1–7 request a row while REPOSITORY is open.
2. RepositoryWindow from `repoModel`: AVAILABLE with ETA and tag, IN TRANSIT, RESTRICTED, the Rm focus.
3. The card's DELIVERIES row and TIMELINE marks (desk.ts from `deliveriesForHop` / `forwardLateness`); `deskSteps` with `'request'` on the first desk only; the steps list in DeskScreen.
4. PACKET: the DELIVERIES chip row (`ARRIVED 2436 · [SEND ON]`, final hop `NO SHIP AFTER LAST LIGHT · IT IS LOST`), the IN TRANSIT line, the SALVAGE heading.
5. INBOX: the `inbox.ts` derivation per §2.4, InboxView (list, reader, stamps, pink no-address mail), the desk host and the flight window with the dock badge, `markMessageRead`, a `chime` once per boot with new mail.
6. Boot words: `'delivery'`, `'inbox'`, `'reading'` (story-log flag); the sleep line's year roll in MindTerminal; the no-Swap ghost line (risk 1).
7. The tally's `NEVER ARRIVED` line.

### 5.3 Track TESTS

Owns `tests/unit/**`, `tests/e2e/**`, and the timings in `tests/unit/run.mjs`. It writes the pure suites against F's real delivery rule from day 1, and the flow suites against the stubs, failing until REPO merges (§6).

### 5.4 Shared hot files and order

| File | Owner | How others add |
|---|---|---|
| `schema.ts` | F (every 3b field) | later fields: lead-approved one-liners |
| `run.ts`, `boot.ts`, `map-boot.ts`, `transmit.ts` (model), `draft.ts` | REPO | UI reads; requests by message |
| `desk.ts`, `script.ts`, `map-text.ts`, `repo-text.ts`, `inbox-text.ts` | UI | REPO's words requested; its conditions live in map-boot / repository.ts, which script.ts calls (F wired them) |
| `tuning.ts` | F creates blocks | each track only inside its block (`BOOT_LINE_AT_SEC`: F) |
| `debug.ts` | REPO | UI and TESTS request helpers |
| `classic-five.ts` | frozen | lead only |
| `src/systems/events.ts` | F / lead | one-liners on request (3b added `'delivery'` and `'inbox-new'`) |
| `src/types/repo.ts`, `systems/delivery-rule.ts`, `systems/delivery-boot.ts` | REPO | UI asks by message |
| `src/types/inbox.ts` | UI | REPO asks by message |
| `systems/repository.ts` `hopOutlook` | REPO | the ONE outlook rule: desk.ts's DELIVERIES row and TIMELINE, `repoModel`'s IN TRANSIT, the PACKET read it, never a copy |

**Order:**
1. F, then review.
2. REPO, UI and TESTS start together.
3. Merge REPO first (the flow; chips appear in the model), then UI (the views read real models), then TESTS.
4. TESTS re-runs run1-route and the e2e after both merges.

**Cycle guard:** repository.ts and inbox.ts must not import `data/script.ts` or `arrival-preview.ts`, because `script.ts → map-boot → repository` would close a cycle. `wp12/fix1/entries` catches cycles.

---

## 6. Tests

The tier is about 232 s on 4 workers against a 300 s cap. New suites are pure or store-level, with no flights (link-over's pattern: `createInitialState({ map })`, `endShip`, `openDesk`, `setCourse`, `transmitNext`).

### 6.1 New suites (each under 5 s)

| Suite | Checks |
|---|---|
| `map/delivery-rule` (pure) | §4.2 every cell (detour, lateness, arrival years, forwarding); forecasts IN TIME / `SHIP n` / NEVER at the worked route's desks; NEVER into a final ship; INFO profile over 50 arms against 02 §3.9 |
| `map/repository` (pure + store) | the catalogue and its validation; the recommendation's order on run 1 (Mv, Rm, Swap at KESTREL); none at the end; the last-rm desk window; one request, changeable across `◀ CHART`, cleared at TRANSMIT ▸; restricted refused; REPAIR v2 absent from the arm's salvage deals and present on the classic world |
| `map/delivery-packet` (store) | chips for new / caught-up / sent-on; link and room bars count them; the gate; SEND ON frees link for charge; final-hop SEND ON goes lost; preview equals layout with delivery seeds over 200 random mixes; seeds never on a first-of-kind / calm / patch; beam seeds never behind a delivered file; transit hits can land on deliveries; licences and untried kinds; the patch after renewal (a unit with no working Repair: renewed, then v2, patch blocks freed); spare copies; boot lines in order and folded past 3 |
| `map/inbox` (pure) | §4.3's table on the worked route with a fixture of `ShipResult`s; stamps; joined postcards; no postcard without `landedInLz`; the stale greeting; ring crossings for a two-layer hop; arm only (classic boots have no `'inbox'`); the reading line once |
| `map/text` (extend) | every repo-text / inbox-text template at its worst case ≤ 70 chars, ≤ 6 body lines |

### 6.2 Changed suites

- **`map/run1-route`** (flown, about 19 s, no new flights). The interim-licence check becomes requests per §3.14 at each desk (Mv, Rm, Swap, Cp):
  - DELETE arrives on KESTREL's boot;
  - SWAP is absent on VESPER and present on CORMORANT;
  - COPY arrives on LAST LIGHT;
  - `NEVER ARRIVED` is empty;
  - the boot's delivery lines appear.

  It prints VESPER's outcome without SWAP (risk 1). If the defenders' kid can't fly VESPER without SWAP, TESTS reports it rather than requesting differently.
- **`map/memory-classes`** keeps `installAddress`.
- **`map/desk-models`** and **`map/packet-room`** get new rows and chips.
- Classic suites: no change. The classic world has no repository, no INBOX lines and REPAIR v2 still in its draft.
- If the tier goes over 280 s, trim the delivery-rule profile to 20 arms first.

### 6.3 e2e (once, at the end)

- **`playthrough.mjs`:**
  - at each desk, open [R] and click REQUEST on §3.14's file, checking the ETA strings (IN TIME, `4 YRS LATE → …`, NEVER at CORMORANT);
  - PACKET chips: Rm into KESTREL, Swap into CORMORANT, Cp into LAST LIGHT; SALVAGE without REPAIR v2;
  - boot `> DELIVERY:` lines; `INBOX 1` on ARES-VII and the welcome opened; the reply at HALCYON;
  - VESPER's check becomes ghost thrust without SWAP (the no-Swap line).
- **`map-desk.mjs`:**
  - R/I tabs and badges; request toggling; the TIMELINE's red mark;
  - SEND ON forced via `__ap` (a big delivery onto a TIGHT room);
  - last-rm (an `__ap` delete of the rm) opens REPOSITORY on Rm;
  - phone tabs; the flight INBOX window.
- **`run-flow.mjs`:** arm KESTREL's DELETE comes from `__ap.give('rm')` (or a route with requests), not a licence.
- **`label-hops`, `phone`, `beam-blue`:** unchanged (classic).

---

## 7. Risks and open questions (each with a recommended answer)

1. **VESPER without SWAP (gameplay; flag to Fran).** On §3.14's route Swap arrives 4 years late, and phase 2 always gave SWAP "with the problem". A 16-pod ENGINE FAULT ark flown by hand without SWAP may be harsh. Arks reached by long hops often have too little slack for a request.
   - **Recommend:** ship the spec (02 §2 names it as the trade-off); add a strip line for ghost thrust with no Swap aboard (`NO SWAP ABOARD — SPACE ends each burst`).
   - **Measure:** VESPER in run1-route, plus an INFO "ENGINE FAULT ships reached without Swap when following the tag" in `map/delivery-rule`.
   - **Lever, if it hurts:** let the Swap rule look one hop further (`REPO_SWAP_LOOKAHEAD_LAYERS` 2 → 3).
2. **The first desk's request step only guides** (decision 19: no confirm). **Recommend:** done when any request is set; SET COURSE never waits.
3. **`run.licences` meaning.** **Recommend:** "kinds that reached the unit". A delivery of a held kind is a spare: not untried, never seeded? No: spares can carry seeds; only first-of-kind deliveries are exempt (04 §3.4).
4. **"No Rm → Rm" with an Rm in flight.** Taken literally, CONTROL tags Rm two desks running. **Recommend:** a request in transit or waiting counts as owned. The ETA still tells the truth.
5. **SEND ON on a hop into a final ship.** 02 says "the chip says there is none". **Recommend:** the toggle stays and reads `IT IS LOST`, and the tally lists it.
6. **The patch as a file.** **Recommend:** an `UpgradeSegment` (`repair-patch`, 2 blocks) that crosses, takes hits, never carries a seed, and installs at its boot line after `renewRepairAtBoot`. The alternative (bump at transmit plus a run flag) hides its room cost.
7. **Mail volume:** about 21 messages on the worked route against 05's estimate of 10. **Recommend:** build to 05 §3.3, print per-boot counts in `map/inbox`, and raise only if the playtest finds a wall (mail never blocks; 05 §10).
8. **Message timing reading.** Messages use direct light from their source (05's postcard rule; it matches every §3.12 stamp); files use 02's forward rule. No-address RECEIVED = the ring-crossing year (05's sample 2560 has no stated rule). **Recommend:** keep both readings and record them for 05/02's owner.
9. **Repository mail** (receipts; 05 §8.4). **Recommend:** none in 3b. The boot lines and IN TRANSIT say it all. Add receipts only if the playtest misses them.
10. **Postcard bios.** 05's 80 progress lines are 05's work. **Recommend:** one placeholder line per colony year now, keyed for per-bio lines later.
11. **The salvage pool after REPAIR v2 leaves it** (4 cards on the arm, with the owned caps). Late deals may show fewer than 3 cards. **Recommend:** accept and measure in `map/repository`. Slice 4's `+2 CYCLES` refills the pool.
12. **Boot length:** up to 18 lines. **Recommend:** fold deliveries at 3; the skip rules hold, and `finishBoot` says every line.
13. **The classic world** gets no repository or INBOX. **Recommend:** yes. It keeps the suites byte-stable, and the classic world is sunset after slice 4.
14. **`RECEIVER CLOSED`** (slice 5) versus a delivery waiting there. **Recommend:** leave the hook returning false now; slice 5 decides.

### Critical Files for Implementation
- /home/user/ArrivalProtocol/src/systems/run.ts
- /home/user/ArrivalProtocol/src/systems/draft.ts
- /home/user/ArrivalProtocol/src/systems/arrival-preview.ts
- /home/user/ArrivalProtocol/src/systems/licences.ts
- /home/user/ArrivalProtocol/src/systems/desk.ts
- /home/user/ArrivalProtocol/src/data/script.ts
- /home/user/ArrivalProtocol/src/state/schema.ts

---

## Deviations (foundation)

The foundation (§5.0 items 1–8) as built. Nothing changes behaviour yet: every stub throws `TODO(3b-REPO)` /
`TODO(3b-UI)` or returns empty, so no boot gains a line and no packet gains a file until REPO and UI fill them.

1. **`receiveDeliveryAtBoot` lives in a new `src/systems/delivery-boot.ts`, not `repository.ts`** (REPO owns it). The patch
   needs `licences.ts renewRepairAtBoot`, and licences.ts imports `data/script.ts`; repository.ts must stay importable from
   script.ts's side of the graph (`draft.ts → repository.ts` already, and later `desk.ts` / the INBOX). boot.ts imports
   delivery-boot.ts. The cycle guard was checked transitively: repository.ts, inbox.ts, delivery-rule.ts and
   data/repository.ts reach none of script.ts, arrival-preview.ts or licences.ts.
2. **Delivery boot lines are groups.** `map-boot.ts deliveryBootLines(state): ArrivalDelivery[][]` (real: at most
   `DELIVERY_BOOT_LINES_MAX` groups, one delivery each, the last folding the rest) and `deliveryBootLineText(state,
   ordinal)`. `bootLinePlan` pushes one `'delivery'` per group; `bootLine(kind, state, vars, ordinal = 0)` throws on an
   ordinal ≠ 0 for any other kind; boot.ts derives the ordinal from the plan (`lineOrdinal`) for the said line and for
   `plannedText`; `receiveDeliveryAtBoot(store, ordinal)` unpacks the whole group (a folded line unpacks every file it
   names). The patch line says `· EVERY REPAIR → v2` without a count: it types before the install, and REPAIR's renewal
   at the same moment may add copies.
3. **§4.2's Cp row.** "2861 at LAST LIGHT" is the year Cp reaches CORMORANT's receiver (44 late). Forwarded by the rule it
   reaches LAST LIGHT's in 3020 − 105 = **2915** (lateness 44 − 149). `map/delivery-rule` pins 2861 at CORMORANT and 2915 at
   LAST LIGHT. §3 step 9's `> DELIVERY: cp (arrived 2861)` should therefore read 2915 if `RepoRequest.arrivedYear` keeps
   its meaning ("the receiver where it caught up"); REPO decides and keeps the boot line and the TIMELINE on one year.
   The receiver year is `receiverYear(approach, lateness) = approach + lateness` at every ship (it equals A(S0) + |S0−SOL| +
   |SOL−S1| at the first one).
4. **`delivery-rule.ts` is complete**, including `deliveryForecast` (§5.1 put its BFS under REPO): both tracks need its
   numbers now. Signatures: `deliveryForecast(map, from, to, toDepth = map.route.length + 1)` (the depth is explicit so a
   forecast from any stop works); `lightArrival(map, source: LightSource, sentYear, route, afterDepth)` with `LightSource =
   { kind: 'sol' } | { kind: 'world'; worldSlot }`, returning `{ depth, receivedYear } | null` (null: no stop of `route`
   takes it yet). `forwardLateness(lateness, hop)` takes the hop's slack, not a map.
5. **A few "stubs" are real** because they are a line or two and the debug helpers need them: `setRequest` (desk phase,
   arm only, unknown ids throw; the pick is not yet cleared by TRANSMIT ▸, which is `advanceRequests`'s job),
   `deliveryFiles(chips, memory, makeId)` (it gains `memory` for Repair.bak's version: `bestRepairVersion`),
   `receiverClosed(map, slot)` (false until slice 5), `newMessagesAtBoot`, `inboxUnread` (a list, not a count) and
   `markMessageRead` over the still-empty derivation. `inbox.ts` also carries 3c's seam `letterSources(run):
   LetterSource[]` (returns `[]`).
6. **Other final signatures that differ from the sketch:** `advanceRequests(repo, plan, map)` (the map for the first
   lateness and the final-ship check; the hop is in the plan); `toggleSendOn(store, key): SendOnRefusal | null` (`'no-chip'`
   for an unknown key); `rollDeliverySeeds(chips, packet, rng): BeamSeedPlan[]` (the beam seeds' own type, so both lists go
   into `packet.seeds` unchanged); `undeliveredFiles(run): RepoRequest[]` (the tally names them). `repoModel` returns
   `RepoModel { world, selected, pick, recommended, recommendLine, available: RepoRow[], inTransit: RepoTransitRow[],
   restricted: RepoRestrictedRow[] }`, defined in systems/repository.ts.
7. **The catalogue derives its sizes** from `TOOL_FILES` (Scan.bak is Scan's size); the only new number is
   `REPAIR_PATCH_BLOCKS = 2` (tuning `3b REPO`). data/repository.ts adds `REPO_FILE_IDS` (the row order for keys 1–7),
   `RESTRICTED_IDS` / `RESTRICTED_ROWS` (`RestrictedId` in types/repo.ts, which slice 4 extends with the tree's skills),
   `repoToolKind(id)` and one `repoFileSegments(id, makeId, repairVersion)` instead of a builder per row.
   `validateCatalogue()` returns its problems (the load-time check throws on any). It checks "no row bigger than its
   kind's biggest tool file" in place of re-running arrival-preview's locked-floor check (which it may not import).
8. **The reading line** is marked by boot.ts as it is said (`run.log.toldReading = true`, as `keepCharge` is), not by
   story-log: no event and no mount-order dependency. `readingLineDue` (state/log-selectors.ts, UI) returns false until
   UI fills it. Its speaker is HOLLOW (pink, slow).
9. **Boot order:** `'delivery'` after `'scripted'`, before `'charge'`; `'reading'` just before `'log'`; `'inbox'` just
   after `'log'`; HOLLOW's `'hollow'` still closes the boot. Fresh-unit boots (ship 1) place `'reading'`, `'log'`,
   `'inbox'` the same way, so the welcome's `> 1 NEW MESSAGE · INBOX` needs no plan change. `'reading'` and `'inbox'` are
   arm only.
10. **`UpgradeKind 'repair-patch'`** had three exhaustive sites (capabilities' live count, `DELETE_CARD_EFFECT`,
    `TRANSMIT_TEXT.withoutCard`), not about seven.
11. **Wiring:** `goTransmit` packs with `planPacket(memory, { …, deliveries })` from the start (the plan's `filesBlocks` /
    `chargeCarried` count deliveries once REPO returns chips); the card's fit line already passes `deliveriesForHop(state,
    from, slot)` to `unitArrival`; `transmitNext` writes `ArrivalReport.deliveries: []` (`TODO(3b-REPO)`). `dealDraft`'s
    room does not count deliveries yet (§5.1 item 3, REPO).
12. **`__ap.give(file)`** emits `'delivery'` for every file. `give('repair-v2')` installs the patch at once, as at its
    boot line: every Repair copy to v2, `run.upgrades` gains `'repair-v2'`, no file is left. A first-of-kind tool goes into
    `run.licences` and `hollow.untriedTools` (REPAIR excepted, as `grantLicence`); a spare is just a file. `__ap.repo()`
    returns `{ state, recommendation, model, deliveries, undelivered }`; `__ap.inbox()` `{ messages, unread, read }`.
13. **Text.** `repo-text.ts` exports `REPO_FILE_TEXT` (name, effect, boot word, desc), `RESTRICTED_TEXT` and `REPO_TEXT`
    (window, row, eta, transit, card, desk, packet, noSwap, boot, tally); `inbox-text.ts` exports `INBOX_TEXT` (window,
    from, welcome, policy ×2, armComplete, reply, postcard y1/y50/y200, letter, noAddress ×2, boot) and `firstNameOf`.
    Every line renders ≤ 70 characters at its worst case (checked by hand; `map/text` is TESTS'); the two new segment
    descs are INSPECT paragraphs, like the tool files' own.

**Measured:** typecheck and the tests tsc pass; `node tests/unit/run.mjs map entries words` 21/21; the new
`map/delivery-rule` 17/17 in 0.6 s; the full unit tier 161/161 in 241 s on 4 workers (fly-once cache cold); a Playwright
pass of run 1 to HALCYON's desk with `__ap.request('mv')`, `__ap.repo()`, `__ap.inbox()`, `__ap.give('rm')` and
`__ap.give('repair-v2')` had no console errors.

## Deviations (foundation, review follow-up)

An independent review of 6989176 confirmed the delivery rule, the Cp correction (CORMORANT 2861, LAST LIGHT 2915), the
light stamps, the BFS, the catalogue sizes, the boot order and the cycle guard. The follow-up commit applies:

1. **`TransmitModel` gains its final 3b fields**: `deliveries: DeliveryChipView[]` (`{ key, file, name, blocks, text,
   sendOn, lost, sendOnLabel }`, from `plan.deliveries`; `lost` = sent on into a final ship), `inTransit: string | null`
   (the hop's outlook entries still in transit that do not ride: one by name, several as a count) and `salvageTitle: string
   | null` (`SALVAGE · PICK ONE TO CARRY` on the arm, null on the classic world).
2. **One outlook rule**: `repository.ts hopOutlook(state, from, to): OutlookEntry[]`, real, on the real delivery rule.
   `OutlookEntry = { key, file, source: 'pick' | 'in-transit' | 'waiting', kind: 'in-time' | 'catches-up' | 'waiting' |
   'late' | 'never', rides, arrivedYear, yearsLate, earliestDepth }`, oldest request first and the pick last; `from`
   must be the current ship (in-transit requests carry their lateness at it); a destination out of reach still has an
   outlook. `deliveriesForHop(state, from, to, threat)` is now real: the riding entries as chips. It gained `threat` (the
   ladder's verdict: no seed into a calm ship), so goTransmit computes the verdict first. `repoModel` stays a stub; its IN
   TRANSIT rows and UI's card must read `hopOutlook`. `delivery-rule.ts` exports `earliestCatchUp` for it.
3. **First of kind**: `deliveryFirstOfKind(run, file)` (false for the patch, for REPAIR and for SCAN: Repair.bak and
   Scan.bak are spares, 02 §3.8, so a delivered Repair.bak no longer pre-empts REPAIR's first-look licence) and
   `markFirstOfKind(run, chips, seedChance)` (only the first chip of a new kind that is not sent on; toggleSendOn must
   re-mark). `__ap.give` uses `deliveryFirstOfKind`; `createShipSlices` seeds `hollow.untriedTools` from
   `arrival.deliveries`' `firstOfKind` flags (decided at the send, before the send adds the kind to `run.licences`, which
   is why it reads the flag rather than calling the helper again).
4. **The catalogue's identity is data**: each row's name and gives live in data/repository.ts (`REPO_FILE_DATA`);
   repo-text keeps the effect, the boot word and the desc (`REPO_FILE_TEXT`), and the locked rows' reasons
   (`RESTRICTED_WHY.skill / .system`). `validateCatalogue` pins v1's blocks `{mv 2, rm 1, cp 3, swap 1, repair-bak 4,
   scan-bak 3, repair-v2 2}` and fails with "bump REPO_CATALOGUE_VERSION" on a drift.
5. **`MessageKind`, `InboxMessage`, `RunInboxState` moved to `src/types/inbox.ts`** (UI).
6. **`'inbox-new': { count }`** is emitted by boot.ts as the `'inbox'` line is said, beside `'log-key'`.
7. **Minors**: the pick's chip key is `rq${nextId}` minted at goTransmit (documented on `DeliveryChip.key`);
   ``RestrictedId = 'thread-plus' | 'firewall-sys' | `skl:${string}` `` (AUTOBURN is `'skl:autoburn'`; `RESTRICTED_ROWS`
   is a list); `deskWindowOnOpen(state)` in repository.ts (REPO; a stub returning null) is what `openDesk` sets
   `ui.deskWindow` from; `DeskWindowId = 'repository' | 'training' | 'inbox'` and `null` is the SHIP CARD (the unused
   `'chart'` / `'card'` ids are gone); `receiverClosed` moved into delivery-rule.ts and is read by `earliestCatchUp`, the
   forecast and `hopOutlook` (one seam); the stale `toldReading` comments and the boot-length WHY are corrected.

**Behaviour now:** a pick set with `__ap.request` rides as a real chip (the card's fit line, the PACKET's numbers and the
crossing include its file), but until REPO's `advanceRequests` and `ArrivalReport.deliveries` land it is never cleared
or recorded, so it rides every later hop too and arrives with no licence. Without `__ap.request` nothing changes.

**Notes for the tracks:**
- REPO:
  - call `renewRepairAtBoot` at the first `'delivery'` line, whatever the file, so a delivered Repair.bak does not cancel
    the free renewal (it would otherwise count as a working copy);
  - define what a damaged or broken patch does at its boot line (transit hits can land on it);
  - never fold the patch into a folded line: put it first in the arrival's order;
  - `repoModel` gives `forecast: null` for an unreachable, TOO LATE or out-of-range destination;
  - `toggleSendOn` re-runs `markFirstOfKind` (a sent-on first of kind hands "first" to the next chip of its kind).
- UI:
  - broadcasts (welcome, policy, arm-complete) are RECEIVED at sent + solLy(ship) of the ship they are read at, not by
    `lightArrival` over the whole route (which would read the arm-complete letter at ship 1): §2.4's "one light rule"
    holds for replies, postcards and letters only;
  - memoise `inboxMessages` per (route length, ships length): boot.ts's `plannedText('inbox')` re-derives it on every
    timing call;
  - message ids are stable keys from the source (`reply:<slot>`, `postcard:<slot>:<year>`), never text or list indices.
- TESTS:
  - pin Repair.bak arriving before REPAIR's first look (REPAIR still comes, `run.licences` gains 'repair' only by the rule);
  - pin two chips of one new kind in one packet (one first of kind, one spare);
  - add a classic boot-plan byte-equality check (the classic world's plans unchanged by 3b).

## Deviations (Track REPO)

Track REPO's slice (§5.1 with the foundation's notes) as built on branch `repo-3b` from 1d450af. Every rule of §2.3 is in
play: requests, chips, SEND ON, delivery seeds, the patch, licences by request, the boot's delivery lines.

1. **The patch comes first.** `transmitNext` writes `ArrivalReport.deliveries` with every REPAIR v2 patch first, then the
   rest oldest first (chip order). `deliveryBootLines` gives each patch a line of its own and folds only the other files
   (with 3+ patches in one arrival the singles are the patches and the rest still fold).
2. **REPAIR's renewal ignores this boot's deliveries.** The delivered files are already in memory when the boot types, so
   the order of calls alone could not stop a delivered Repair.bak from counting as a working copy. `renewRepairAtBoot`
   judges "no working Repair" without the arrival's delivered segment ids, and `receiveDeliveryAtBoot` calls it at the
   first `'delivery'` line, whatever that line carries. The `'charge'` call is then a no-op.
3. **A damaged or broken patch.** A patch that crossed usable (integrity ≥ `BAND_DEGRADED_MIN`, read from the last
   `ArrivalReport.hits` entry on its file: `repository.ts patchInstalls`) installs. Below that it is broken: used up, its
   blocks freed, nothing upgraded, and its boot line is the plain `> DELIVERY: repair_v2.patch (arrived y)` with no
   `· EVERY REPAIR → v2` (UI's own words for it are requested). A patch reaching a unit with no Repair copy (REPAIR not
   licensed yet) is spent for nothing, and `run.upgrades` does not gain `'repair-v2'`.
4. **The recommendation:**
   - "has" means a working copy (usable and not being eaten, as `noWorkingRm` judges), or a request in transit or waiting
     (risk 4);
   - rule 1 (Mv at the first desk) falls through when the unit already has MOVE (only `__ap.give` can do that);
   - rule 3's "reachable ship within two layers" is reach by any route (in range and in time, hop by hop), at most
     `REPO_SWAP_LOOKAHEAD_LAYERS` layers out, ENGINE FAULT read from the ship's modifiers. On run 1 this tags Swap at
     KESTREL (VESPER, and CURLEW one layer out). From HALCYON CURLEW is also in reach, but rule 2 (Rm) comes first.
5. **The last-rm prompt** is `lastRmPrompt(state)`: arm, DELETE licensed, no working rm, **and no Rm already on its way**
   (risk 4's reading, so it does not nag a kid who asked). `deskWindowOnOpen` and the REPOSITORY's Rm `focus` read it.
6. **`repoModel`:** a TOO LATE or OUT OF RANGE selection gives `forecast: null` and `eta: null` on every row and no
   `catchesUp` in IN TRANSIT. IN TRANSIT reads `hopOutlook` for a reachable selection, `behind` is the request's lateness at
   the current ship, and a waiting row names the receiver's ship.
7. **Plumbing:**
   - `Packet.deliveries` (`{ key, segIds }[]`, carry.ts) is filled by `planPacket` through `repository.ts
     deliveryFileGroups`, so the send knows each chip's files without a second adder;
   - `rollBeamSeeds(…, excludeIds = [])` takes every delivered segment id;
   - `rollDeliverySeeds` takes two draws per packed chip whatever its chance, and throws on a target that is not an
     infectable packed file;
   - `arrivalDeliveries` is exported from run.ts (debug.ts and the suites use it);
   - `deliverySeedChance(threat, noise)` is shared by `deliveriesForHop` and `toggleSendOn`.
8. **The draft:**
   - `DraftContext.salvageOnly` is optional (the classic world and phase 2's suites build contexts without it);
   - `draftContext` and `dealDraft` gain an optional `deliveries` argument;
   - the load check requires a salvage card that stacks without limit.
9. **The preview's seed allowance** is the beam's `{min, max}` plus one per packed chip with a chance above 0 on `max`
   (the minimum is unchanged). `seedsExact` covers both kinds.
10. **`advanceRequests`:**
    - a chip that rode sets `lateness: 0` and `at: toSlot`;
    - a waiting request with no chip on the hop throws, and so does a chip that is no request;
    - the pick's request gets `requestedYear = hop.leaveYear`.

    **`undeliveredFiles`** returns every request not delivered. At RUN END that is "in transit, waiting or lost"; mid-run it
    also lists what has not arrived yet.
11. **Debug:**
    - `__ap.slot` carries the hop's deliveries as the send does (seeds, licences, requests moved on);
    - `__ap.route` resets the run's requests, because its stops are rewritten;
    - `__ap.give('repair-v2')` uses `delivery-boot.ts upgradeRepairsToV2`;
    - new `__ap.sendOn(key)`;
    - `__ap.draft().context` is the deal's own (hop room and deliveries).
12. **The no-Swap condition** is `repository.ts noSwapForGhost(state)`: arm only, an uncommanded burst now, the current
    ship's modifiers include ENGINE FAULT, no working Swap. The classic world still licenses SWAP at its first burst.
13. **Cp's year** follows the foundation's correction: the chip, the request and the boot line all say 2915 at LAST
    LIGHT. Swap reaches CORMORANT in 2659.
14. **Tests** (Track REPO's):
    - `map/repository` (4 s) and `map/delivery-packet` (7 s), with the store-level fixture `map/repo-fixture.ts`;
    - `map/classic-boot-plans.txt`, the classic five's boot plans and lines generated from 28ddee8 (pre-3b), byte-compared;
    - `map/run1-route` requests §3.14's files, and its full-depth routes now follow the tag.

**Measured:**
- **Run 1's worked route** (`map/run1-route`, the defenders' kid, 14/14):
  - the tag is Mv, Rm and Swap at the first three desks, then Repair.bak at VESPER and CORMORANT (one working Repair
    left);
  - the files arrive Mv at HALCYON 2337, Rm at KESTREL 2436, Swap at CORMORANT 2659, Cp at LAST LIGHT 2915;
  - NEVER ARRIVED is empty.
- **Risk 1:**
  - VESPER flown without SWAP ends `partial`: 3,200 of 3,200 colonists in an LZ, 1 star, fuel 0%. With phase 2's
    licence it was `locked`;
  - the kid can fly it.
- **Charge at the choice** (MERGE saver), before 3b (28ddee8, interim licences) → now:

  | Route | Before | Now | Now ends |
  |---|---|---|---|
  | worked | 13 | 9 | PURGE |
  | [0,1,4,7,10,13,16,19] | 40 | 38 | MERGE |
  | [0,1,4,7,12,17,19] | 50 | 34 | MERGE |
  | [0,1,4,7,10,13,18,19] | 10 | 0 | PURGE |

  On the three full-depth routes, which follow the tag, CURLEW (ENGINE FAULT, layer 4) is **stranded** every time: its
  Swap was requested at HERON and arrived later. On the last route WAYFARER escaped.
- **INFO over 50 fresh arms, following the tag on random routes** (`map/repository`):
  - ENGINE FAULT ships were reached without Swap 8 times out of 9 (89%);
  - with the lever `REPO_SWAP_LOOKAHEAD_LAYERS = 3` (measured, not committed) it was 5 of 9 (56%);
  - 128 tagged requests were made, and 115 were delivered before the run ended;
  - risk 11: 0 of 254 salvage deals had fewer than 3 cards.
- **`map/delivery-packet`**, over 200 random sends on fresh arms:
  - 390 files were delivered and 12 carried a seed;
  - 25 sends had a transit hit on a delivery;
  - the preview equalled the layout every time.
- Unit tier: 163/163 suites pass. The timings are not clean: a run alongside my own jobs took 282 s (161 suites, before
  the new two), and two full runs at 445 s and 457 s overlapped another track's tier on the same 4 cores (load 11–13), so
  the 300 s budget check failed on wall time only. The new suites take, unloaded: `map/repository` 4 s,
  `map/delivery-packet` 7 s, `map/run1-route` 14–18 s (about 19 s before).

## Deviations (Track UI)

Track UI's part (§5.2) as built on branch `ui-3b`, against the foundation's stubs (REPO's `repoModel`, `recommendation`,
`toggleSendOn`, `advanceRequests`, `undeliveredFiles` and `deskWindowOnOpen` were still stubs; every view reads their final
types and was checked with crafted models and, for the screenshots only, a throwaway `repoModel`).

**The INBOX (`systems/inbox.ts`).**
1. **§4.3's table holds exactly** on the worked route (21 messages; `map/inbox` pins every boot and stamp), with the
   follow-up's broadcast rule (sent + solLy at the boot they belong to).
2. **Postcards carry no age.** The landing record keeps the featured colonists' names only (`PodSummary.featured`), so
   05 §3.12's `I'm 12 now` is dropped: year 1 is 3 lines, year 50 one line, year 200 two, so all three joined fit the
   reader's six lines. Joined cards keep a `· · ·` separator while it fits, else drop it. The writer is the first featured
   colonist of the first pod down in an LZ; year 200's head count is `landedInLz × POSTCARD_PEOPLE_PER_COLONIST_Y200` (20).
   Ids: `postcard:<slot>:1+50` (the years joined).
3. **Replies:** one per ended non-final `ShipResult`, whatever its outcome (CONTROL is delighted by everything); the
   performance word is by stars (★★★ EXCELLENT, ★–★★ ACCEPTABLE, none SUFFICIENT); the stale greeting from
   `REPLY_STALE_AFTER_SHIPS = 2` ships late (`Dear Unit 46` on run 1).
4. **No-address mail's RECEIVED** is the hop's leave year plus its distance times the share of the SOL-distance gap up to
   the ring (`2481` for ring 3 on KESTREL → VESPER, the plan's §4.4 sample). A first ship counts rings from SOL.
5. **The arm-complete letter's relay** is `19 + (unit − 46)` (046 went to RELAY 19; 047 gets RELAY 20). The welcome always
   recommends `mv` (02 §3.8's first rule), so it never disagrees with the first desk's tag.
6. **The memo key** is the route's slots, each ship's slot / depth / landed / stars / colony, the run and the unit, not
   only the two lengths: crafted test states of equal lengths must not share a result, and it is still a string of a few
   dozen characters.
7. `readingLineDue` exports `READING_LINE_AFTER_ENTRY = 5`; the arm only.

**The desk.**
8. **DELIVERIES row:** a sent-on (waiting) request reads `Swap ✓ RIDES WITH YOU` (new words), and its TIMELINE mark sits at
   the unit's own arrival (it rides in the packet). The row follows 02 §4's order (after BEAM, before `SHIP n OF YOUR
   RUN`). Marks are listed under the TIMELINE's text too (`2629 Swap` in red), not appended to it (two marks would pass
   70 characters).
9. **Tabs:** desk.ts gains `openDeskWindow`, `toggleRequest` (a second REQUEST, or number key, clears the pick) and
   `deskTabBadges` (the REPOSITORY's badge names the pick, or `:)` while a file is recommended; the INBOX's is the unread
   count). R and I toggle their tab back to the card. The tabs show on the classic world too (its REPOSITORY says `NO
   REPOSITORY ON THE CLASSIC ROUTE`, its INBOX `NO MAIL ON THE CLASSIC ROUTE`). `DeskStep` gains `label` (the strip's short
   name).
10. **Phone:** the tab bar is the sheet's handle and always peeks on the arm (32 px) so the REPOSITORY and INBOX are one tap
    away before a ship is picked; a tab opens the sheet; a desk that opens on a tab (the last-rm prompt) opens the sheet.

**The PACKET, the flight window, the boot, the tally.**
11. The delivery chips use `TransmitModel.deliveries` as REPO built them (the chip's note repeats the name its head
    shows: REPO may want `text` without the name). A `toggleSendOn` refusal other than `'no-chip'` buzzes; `'no-chip'`
    throws. The PACKET paints nothing once its plan is cleared (a debug jump from the PACKET used to throw there).
12. **The flight INBOX** is `.inbox-win` over the NAV PLOT's column (z-index 3 while open). Its dock item's label reads
    `INBOX n` while mail is unread (the walk's `INBOX 1`) and pulses from `'inbox-new'` until opened. `src/main.ts` gained
    one line, `mountInboxWindow(store)` (main.ts is in neither track's list).
13. **The year roll** rolls only the approach year (the line keeps its length, so the typing is unchanged), on wall time
    from the moment the line starts typing, with a soft `typeTick` ratchet every `SLEEP_YEAR_TICK_YEARS = 5`; reduced
    motion shows the true year. The TERMINAL finds the line by reading it back (`map-text.ts sleepLineYears`, pinned
    against `MAP_TEXT.boot.sleep` in `map/text`), not by a new `LogEntry` field.
14. **The no-Swap line** reads `NO SWAP ABOARD — fly through each burst, then fix ▼` (the draft's `SPACE ends each
    burst` is true only of a sticky burst, which has its own line). After the REPO merge it shows on REPO's
    `noSwapForGhost` (a burst running on an ENGINE FAULT arm ship with no working Swap), once, for up to
    GHOST_LESSON_SHOW_SEC across the bursts; the THRUST CTRL pip step waits for SWAP to have reached the unit
    (`run.licences`). The classic world licenses SWAP with the first burst, so its lessons are unchanged.
15. **NEVER ARRIVED** is a `RunEndModel.undeliveredLine` (null on the classic world), under the colonies line.
16. **Audio:** `chime` on each `'delivery'` and on `'inbox-new'`.

**Tuning `3b UI` additions:** `POSTCARD_PEOPLE_PER_COLONIST_Y200 = 20`, `REPLY_STALE_AFTER_SHIPS = 2`,
`SLEEP_YEAR_TICK_YEARS = 5`.

**After the REPO merge (0fd0dc6).** `REPO_TEXT.boot.patchBroken` reads `> DELIVERY: repair_v2.patch (arrived 2337) ·
DAMAGED · NOT INSTALLED` (REPO's draft `NOTHING INSTALLED` ran to 72 characters at its worst case); map-boot's
`deliveryBootLineText` uses it when `patchInstalls` says no (the one approved edit in REPO's file), and
`map/delivery-packet`'s broken-patch check pins it. The views were re-checked against the real models (screenshots in
`tests/.out/ui-3b/`): REPOSITORY rows, the tag, KESTREL's Rm recommendation and `4 YRS LATE → … SHIP 5`, the card's red
`2629 Swap`, SEND ON (`SENT ON · RIDES YOUR NEXT HOP`, FILES 59 → 57).

**Requests (before the merge; the REPO ones are now met by its models).** REPO: `repoModel`'s AVAILABLE rows in `REPO_FILE_IDS` order (the number keys index them), `focus` on Rm for
the last-rm prompt, ETAs from `REPO_TEXT.eta`; a "Swap aboard" selector if the licence reading is not the one wanted;
`__ap.route` leaves no `ShipResult` for the ships it flies through (only ship 1's mail shows at KESTREL after it). Lead /
landing owner: the featured colonists' ages in `PodSummary` for the postcards' `I'm 12 now`.
