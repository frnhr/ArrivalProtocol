import type { RepoFileId } from '@/types/repo';

// PLACEHOLDER(05): every word slice 3b puts on screen for the repository and its deliveries (docs/phase3/02-map.md §3.8,
// §3.9, §4; 01-landing §3.16's PACKET; 04-threats §3.3's last rm; slice-3b-plan §1.1 items 1–16, §3), drafted from the
// specs' sample lines for 05-story's owner to sign off. Each line renders to at most MAX_LINE_CHARS (70) with the longest
// names and numbers (tests/unit/map/text.test.ts) and says no never-say word (tests/unit/support/words.test.ts).
// Track UI owns this file after the foundation; Track REPO asks UI for words by message (plan §5.4). The conditions that
// pick a line live in systems/repository.ts, systems/map-boot.ts and systems/desk.ts, never here.

const yrs = (years: number): string => `${years} ${Math.abs(years) === 1 ? 'YR' : 'YRS'}`;
const blocks = (count: number): string => `${count} ${count === 1 ? 'BLOCK' : 'BLOCKS'}`;

// One catalogue row's words (data/repository.ts reads them): its effect on the AVAILABLE row, its word on the boot's
// `> DELIVERY:` line, and the desc a new segment of it carries (the tool files keep data/fs-tools.ts's own desc; the two
// new defs, Scan.bak and the patch, have theirs here). A row's NAME is not here: it is the file's identity (the copied
// tool file's name, 3c's content check), data/repository.ts's.
export interface RepoFileText {
  effect: string;
  boot: string;
  desc: string | null;
}

export const REPO_FILE_TEXT: Readonly<Record<RepoFileId, RepoFileText>> = {
  mv: { effect: 'MOVE', boot: 'mv', desc: null },
  rm: { effect: 'DELETE', boot: 'rm', desc: null },
  cp: { effect: 'COPY', boot: 'cp', desc: null },
  swap: { effect: 'SWAP', boot: 'swap', desc: null },
  'repair-bak': { effect: 'A SPARE REPAIR', boot: 'repair.bak', desc: null },
  'scan-bak': {
    effect: 'A SPARE SCAN', boot: 'scan.bak',
    desc: 'Backup copy of Scan. If Scan gets damaged, this one keeps working.',
  },
  'repair-v2': {
    effect: 'EVERY REPAIR COPY → v2', boot: 'repair_v2.patch',
    desc: 'A patch from the repository. It installs at the boot: every Repair copy becomes v2, and the patch is used up.',
  },
};

// Why a locked row is locked (02 §3.8), by what it is: a skill from the tree, or a system file CONTROL keeps. Playtest 1
// (B-VOICE): CONTROL's official voice, no smiley.
export const RESTRICTED_WHY: Readonly<Record<'skill' | 'system', string>> = {
  skill: 'Caretakers train their own',
  system: 'Not available to caretakers',
};

export const REPO_TEXT = {
  // --- The REPOSITORY window (02 §4; plan §1.1 items 1–5) --------------------------------------------------------------
  window: {
    title: 'REPOSITORY',
    tab: 'REPOSITORY [R]',
    inTransit: 'IN TRANSIT',
    restricted: 'RESTRICTED',
    request: 'REQUEST',
    requested: 'REQUESTED',
    clear: 'CLEAR',
    locked: 'LOCKED',
    // One request per beam (02 §3.8): what the window says under the list. Playtest 1 (§3.7): the beam, not the screen.
    oneRequest: 'ONE REQUEST PER BEAM',
    // The tag (02 §3.8; decision 19: the tag is the advice, no confirm). Playtest 1 (B-VOICE): CONTROL's, official.
    recommended: '★ RECOMMENDED',
    nothingToRecommend: 'No further software is required.',
    // Review M3: nothing sent from this desk reaches the unit before its run ends (every route's forecast is NEVER), so
    // there is no tag at all.
    nothingCanReach: 'No delivery can reach you in time.',
    // The last-rm prompt (04 §3.3, round 3): the desk opens here with Rm lit.
    lastRm: 'YOUR LAST RM IS GONE · NO RM, NO WAY TO DELETE THE ROOT',
    // Playtest 1 (B-DESK, §3.6): the window's upper half, what Earth sends by light, with its key; COMPILE HERE is below.
    fromEarth: 'FROM EARTH',
    key: 'R',
  },
  // An AVAILABLE row: `Mv · 2 BLOCKS · MOVE`, then its ETA for the selected destination.
  row: (name: string, size: number, effect: string): string => `${name} · ${blocks(size)} · ${effect}`,
  // Playtest 1 (note 12): what the unit already has of a row's file, under it (systems/repository.ts RepoRow.have).
  // `coming`: requests of it still on their way.
  have: (owned: number, coming: number): string => `YOU HAVE ${owned}${coming > 0 ? ` · ${coming} ON THE WAY` : ''}`,
  // The patch upgrades Repair rather than adding a copy: the version the unit runs.
  haveVersion: (version: number, coming: number): string => `YOU RUN REPAIR v${version}${coming > 0 ? ` · ${coming} ON THE WAY` : ''}`,
  // The ETA (systems/delivery-rule.ts deliveryForecast): `ARRIVES 2337 · HALCYON APPROACH 2352 · IN TIME`.
  eta: {
    inTime: (arrived: number, ship: string, approach: number): string => `ARRIVES ${arrived} · ${ship} APPROACH ${approach} · IN TIME`,
    late: (yearsLate: number, depth: number): string => `${yrs(yearsLate)} LATE → FOLLOWS YOUR ROUTE · SHIP ${depth} AT THE EARLIEST`,
    never: 'NOTHING WILL REACH YOU IN TIME',
  },
  // The IN TRANSIT rows (02 §3.9: "the file is n years behind you").
  transit: {
    behind: (name: string, years: number): string => `${name} · ${yrs(years)} BEHIND YOU`,
    waiting: (name: string, ship: string): string => `${name} · WAITING IN ${ship}'S RECEIVER`,
    catchesUp: (name: string, ship: string): string => `${name} · CATCHES UP AT ${ship}`,
  },

  // --- The SHIP CARD (02 §4; plan §1.1 item 13) --------------------------------------------------------------------------
  card: {
    deliveriesLabel: 'DELIVERIES',
    late: (name: string, years: number): string => `${name} ✗ ${yrs(years)} LATE`,
    // No route catches it up before the run ends (review m2).
    never: (name: string): string => `${name} ✗ NEVER ARRIVES`,
    // Review item 1 (d): an ENGINE FAULT ship reached with no Swap aboard and none riding the hop.
    noSwapInTime: 'ENGINE FAULT · NO SWAP IN TIME',
    catchesUp: (name: string): string => `${name} ✓ CATCHES UP HERE`,
    inTime: (name: string): string => `${name} ✓ WAITING HERE`,
    // A file sent on from the ship being left: it rides in the packet, in time by definition.
    ridesWithYou: (name: string): string => `${name} ✓ RIDES WITH YOU`,
    // The TIMELINE's mark: `2629 Swap` (green before ▲, red after).
    mark: (year: number, name: string): string => `${year} ${name}`,
  },

  // --- The DESK's guidance and tabs (02 §4; plan §1.1 item 15, §5.2 item 1) -----------------------------------------------
  desk: {
    // The first desk's file step (02 §4: ship → file → SET COURSE); it guides only, SET COURSE never waits for it.
    request: (file: string): string => `REQUEST ${file} · RECOMMENDED [R]`,
    requestAny: 'REQUEST A FILE [R]',
    requested: (file: string): string => `${file} REQUESTED`,
    tabCard: 'CARD',
    tabRepository: 'REPOSITORY [R]',
    tabInbox: 'INBOX [I]',
    // The REPOSITORY tab's badge while CONTROL recommends a file and none is asked for (playtest 1: the tag's star).
    badgeRecommended: '★',
  },

  // --- The PACKET (02 §4; 01 §3.16; plan §1.1 item 14) -------------------------------------------------------------------
  packet: {
    deliveriesLabel: 'DELIVERIES',
    chip: (name: string, size: number, arrived: number): string => `${name} · ${blocks(size)} · ARRIVED ${arrived}`,
    sendOn: '[SEND ON]',
    sentOn: 'SENT ON · RIDES YOUR NEXT HOP',
    // On a hop into a final ship (02 §3.9: "on the final ship the chip says there is none").
    lostAfter: (ship: string): string => `NO SHIP AFTER ${ship} · IT IS LOST`,
    inTransit: (name: string, years: number): string => `IN TRANSIT: ${name} · ${yrs(years)} BEHIND YOU`,
    inTransitMore: (count: number): string => `IN TRANSIT: ${count} FILES BEHIND YOU`,
    // The draft's heading on the arm (3a's deferred wording; 02 §3.10: SALVAGE at the PACKET's top).
    salvage: 'SALVAGE · PICK ONE TO CARRY',
    // The gate (plan §1.1 item 8): files, deliveries and the floor over the room or the link.
    overWithDeliveries: (blocksOver: number): string => `${blocks(blocksOver)} TOO MANY · LEAVE FILES OR SEND ON`,
    // ...and the arrival line then (MAP_TEXT.packet.arrivalLeave's twin).
    arrivalOverWithDeliveries: 'ON ARRIVAL: LEAVE FILES OR SEND ON FIRST',
  },
  // The strip's ghost-thrust lines when no Swap is aboard (plan risk 1; slice 3b review item 1; Fran's limping engine):
  // REPAIR on Thrust Ctrl calms the bursts (in amber, the TAB first), and with no REPAIR or charge to do it, how to fly
  // through them (SKIP is refused meanwhile: pace.ts SKIP_REFUSAL_ENGINE_FAULT).
  noSwap: 'NO SWAP ABOARD — REPAIR THRUST CTRL to calm the bursts',
  noSwapTab: 'NO SWAP ABOARD — [TAB], REPAIR THRUST CTRL to calm the bursts',
  noSwapFly: 'NO SWAP ABOARD — nothing stops the bursts. Fix ▼ after each one',
  // The same for a seed with no rm aboard and debris coming for the drivers with no Mv (review M2: those lessons went
  // silent without their tool). The REPOSITORY is a desk tab, so the line points at the next desk.
  noRm: 'NO RM ABOARD — ask the REPOSITORY [R] at the next desk',
  noMv: 'NO MV ABOARD — ask the REPOSITORY [R] at the next desk',

  // --- The boot (02 §4 step 6; plan §1.1 item 12) ------------------------------------------------------------------------
  boot: {
    delivery: (file: string, arrived: number): string => `> DELIVERY: ${file} (arrived ${arrived})`,
    // A patch says what it upgraded (02 §4). No count of copies: the line types before the patch installs, and REPAIR's
    // renewal at the same moment may add copies.
    patch: (file: string, arrived: number): string => `> DELIVERY: ${file} (arrived ${arrived}) · EVERY REPAIR → v2`,
    // A patch a transit hit broke installs nothing (systems/repository.ts patchInstalls): the line says so. (REPO's draft,
    // `· DAMAGED · NOTHING INSTALLED`, ran to 72 characters with the patch's word.)
    patchBroken: (file: string, arrived: number): string => `> DELIVERY: ${file} (arrived ${arrived}) · DAMAGED · NOT INSTALLED`,
    // Beyond the third file the lines fold into one (DELIVERY_BOOT_LINES_MAX): the files by name, the years they span.
    folded: (files: readonly string[], first: number, last: number): string =>
      `> DELIVERY: ${foldNames(files, 2)} (arrived ${first === last ? first : `${first}–${last}`})`,
  },

  // --- RUN END (02 §3.9, §4; plan §1.1 item 16) --------------------------------------------------------------------------
  tally: {
    neverArrived: (names: readonly string[]): string => `NEVER ARRIVED: ${names.length === 0 ? '—' : foldNames(names)}`,
  },
} as const;

// A list of file words that never runs past a strip row: the first `shown`, then `+n`.
function foldNames(names: readonly string[], shown = 3): string {
  const listed = names.slice(0, shown).join(', ');
  return names.length > shown ? `${listed} +${names.length - shown}` : listed;
}
