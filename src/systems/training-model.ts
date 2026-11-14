// Slices 4c–4e: the lead owns this file (slice-4cde-plan.md §7.2; slice 6: slice-6-plan.md §5, the AHEAD row's site line).
// Others ask by message.
// The TRAINING tab's model (phase 3 slice 4; docs/phase3/03-skills.md §4; slice-4-plan §2.5, §3): pure, over TREE's reads
// (skill-tree.ts treeCells, bankOf, held, paid, lostLevels, deskBlocker) and the desk's selection (UiState.trainingSel,
// trainingHoldSec). The view (components/desk/TrainingWindow.ts) only lays it out.
// • Visit 1 (the run's first desk on the arm): the cards only, one per open root (4a: AUTOBURN v1 alone, plan risk R5),
//   under CHOOSE YOUR FIRST SKILL, keys [1] [2], then TRAIN; ARRIVAL CONTROL's line; `+2 CYCLES` when the floor topped the
//   bank up; once picked, `2 CYCLES · SAVED FOR NEXT TIME`.
// • From visit 2: the grid. One column per branch that is open, its versions down and (AUTOBURN) LOCK RANGE on a side axis,
//   each cell joined to the one it needs by a trace that lights once that cell is held; the closed branches are one dim
//   `NOT YET` row each, the reason on hover (playtest 1, §3.7). The selected cell's detail (what it is, its price and size, NEXT SHIP, why not) holds TRAIN, or
//   RESTORE on a lost cell.
// • Every desk: the bank in the head, this desk's purchases with UNDO (the last of each skill only: training.ts
//   undoPurchase), the AHEAD row for the ship selected on the chart (none until one is), the packet preview with the limit that binds, and the
//   last unit's flavour line.
// Also here: the LANDING REPORT's cycles line (cyclesReport), from the same earning endShip records (run-score.ts shipCycles).
import type { GameState } from '@state/schema';
import type { RoomFit } from '@/types/map';
import type { SkillId, SkillPurchase, CellRow, SkillVersion, CycleEarning } from '@/types/skill';
import {
  treeCells, bankOf, deskBlocker, visitNow, held, paid, restoreCostOf, isFirstDesk, skillDemos, demoKindOf, type TreeCell,
  type CellLook, type TrainRefusal,
} from '@systems/skill-tree';
import { unitArrival } from '@systems/arrival-preview';
import { skillRelief } from '@systems/skill-files';
import { deliveriesForHop } from '@systems/repository';
import { mapFacts } from '@systems/map-facts';
import { planThreat, threatInputFor } from '@systems/threat-plan';
import { finalTraceInput } from '@systems/traces';
import { currentSlot, shipSummaryAt } from '@systems/map-run';
import { hopBetween, reachableFrom } from '@systems/map-hop';
import { SKILL_TREE, SKILL_IDS, skillBlocks } from '@data/skills';
import { layoutFor } from '@data/memory';
import { NOISE_WORD } from '@data/map-text';
import { TRAINING_TEXT, TRAINING_DEMO_ART, type DemoCount, type DemoArt } from '@data/training-text';
import { surveyAheadLine } from '@systems/survey-hud';
import { CHARGE_ARRIVAL_FLOOR, CYCLES_LANDED_STEPS, FIRST_PICK_FLOOR_CYCLES, LOCK_RANGE_TAC, TRAINING_HOLD_SEC } from '@data/tuning';

// The TRAIN bar's length lives in tuning.ts (the review's m8); re-exported for the desk's actions and the suites.
export { TRAINING_HOLD_SEC } from '@data/tuning';

// The cell a click or a key chose (UiState.trainingSel), as the model and the view name it.
export type TrainingSel = NonNullable<GameState['ui']['trainingSel']>;

export interface TrainingCellView {
  key: string;                 // 'autoburn:v2', 'autoburn:L1'
  skill: SkillId;
  row: CellRow;
  look: CellLook;
  refusal: TrainRefusal | null;
  price: number;
  blocks: number;
  name: string;                // AUTOBURN v2 / LOCK 270
  mode: string;                // GREEN, THEN ROUND / LOCK RANGE
  cost: string;                // 5 · 8 (CYCLES · BLOCKS)
  nextShip: string;            // NEXT SHIP: …
  status: string;              // TRAINED / TRAINED HERE / LOST · RESTORE 3 / NOT YET / NEEDS v1 FIRST / NEEDS 2 CYCLES MORE / ''
  why: string | null;          // NOT YET's reason, on hover (NEEDS A POOR PLANET AHEAD); null on an open cell
  selected: boolean;
  parent: string | null;       // the cell it needs (the trace it hangs from)
  lit: boolean;                // held (owned or pending): its trace from the parent lights
}

export interface TrainingBranch {
  skill: SkillId;
  branch: string;              // FLIGHT
  name: string;                // AUTOBURN
  open: boolean;
  newest: boolean;             // the newest open branch (the phone's accordion opens it)
  versions: TrainingCellView[];
  locks: TrainingCellView[];   // the side axis (AUTOBURN's LOCK RANGE); [] elsewhere
}

export interface TrainingCard {
  key: string;                 // the number key: '1', '2'
  skill: SkillId;
  name: string;                // AUTOBURN v1
  pitch: string;
  cost: string;                // 3 CYCLES · 6 BLOCKS
  trained: boolean;            // picked at this desk (or held already): stamped TRAINED
  demo: DemoArt;               // its v1's mini-demo
  selected: boolean;
  refusal: TrainRefusal | null;
}

// What TRAIN does on the selection: train it, or RESTORE what was lost (decision 16), and whether it can now.
export interface TrainingAction {
  kind: 'train' | 'restore';
  label: string;               // TRAIN ▸ 3 CYCLES / RESTORE v2 ▸ 3 CYCLES, with [ENTER] while the cell is armed
  cost: number;
  enabled: boolean;
  why: string | null;          // why not (the cell's status)
  holdText: string;            // the bar's words while it fills
}

// A branch not open yet: its one row (`DEFENCE · SENTRY`) and why, on hover.
export interface TrainingClosed {
  name: string;
  why: string;
}

export interface TrainingDetail {
  cell: TrainingCellView;
  demo: DemoArt;               // the mini-demo's loop (the view's drawing, by data: training-text.ts TRAINING_DEMO_ART)
  lines: string[];             // mode, price and size, NEXT SHIP
  status: string | null;       // the long form of why it can't be bought, or that it was bought here
  action: TrainingAction | null;
}

export interface TrainingPending {
  index: number;               // its place in run.skills.pending (training.ts undoPurchase's argument)
  text: string;                // AUTOBURN v1 · 3 CYCLES
  undoable: boolean;           // the last pending purchase of its skill (a lower level under a higher can't go first)
}

export interface TrainingPreview {
  text: string;                // FILES 66 + SKILLS 9 · LINK 117 · ROOM FOR 42 CHARGE
  tone: 'quiet' | 'warn' | 'over';
  binding: 'link' | 'room';
  hint: string | null;         // when it does not fit: the cheapest way out
}

export interface TrainingModel {
  visit: number;
  firstPick: boolean;          // visit 1: the cards, not the grid
  armed: boolean;              // the selection was picked this visit, so ENTER trains it (review M3; desk.ts deskEnter)
  title: string;               // COMPILE HERE (playtest 1, B-DESK: the REPOSITORY's lower half)
  bank: number;
  bankText: string;            // 5 CYCLES
  demos: string;               // YOUR DEMOS · 1 CAPTURE
  control: string | null;      // ARRIVAL CONTROL's first-visit line
  topUp: string | null;        // +2 CYCLES
  blocked: boolean;            // SET COURSE waits for the first pick (skill-tree.ts deskBlocker)
  cards: TrainingCard[];
  branches: TrainingBranch[];
  closed: TrainingClosed[];    // the closed branches' one row each (SURVEY · SURVEY · NOT YET), the reason on hover
  cells: TrainingCellView[];
  selected: TrainingCellView | null;
  detail: TrainingDetail | null;
  pending: TrainingPending[];
  saved: string | null;        // visit 1 after the pick: 2 CYCLES · SAVED FOR NEXT TIME
  ahead: string | null;        // null until a ship is picked on the chart
  // Slice 6 (R15): the AHEAD row's second line, the selected ship's site data (Track SITES's systems/survey-hud.ts
  // surveyAheadLine: `SITE DATA POOR · SURVEY FINDS BETTER SITES`), or null.
  aheadSite: string | null;
  preview: TrainingPreview | null;
  lastUnitLine: string | null;
  hold: number | null;         // the TRAIN bar, 0..1 (null: not filling)
  holdText: string | null;
}

const rowKey = (row: CellRow): string => (row.kind === 'version' ? `v${row.version}` : `L${row.level}`);
export const cellKey = (skill: SkillId, row: CellRow): string => `${skill}:${rowKey(row)}`;
const sameRow = (a: CellRow, b: CellRow): boolean => rowKey(a) === rowKey(b);

function cellName(skill: SkillId, row: CellRow): string {
  const name = TRAINING_TEXT.skills[skill].name;
  return row.kind === 'version' ? TRAINING_TEXT.cellName(name, row.version) : TRAINING_TEXT.lockName(LOCK_RANGE_TAC[row.level]);
}

// The row a cell needs held before it (03 §3.2: prerequisites only run within a branch), or null for a root.
function parentRow(row: CellRow): CellRow | null {
  if (row.kind === 'version') return row.version === 1 ? null : { kind: 'version', version: (row.version - 1) as SkillVersion };
  return row.level === 1 ? { kind: 'version', version: 1 } : { kind: 'lock', level: 1 };
}

function shortStatus(cell: Readonly<TreeCell>, bank: number, restore: number): string {
  switch (cell.look) {
    case 'owned': return TRAINING_TEXT.status.owned;
    case 'pending': return TRAINING_TEXT.status.pending;
    case 'lost': return TRAINING_TEXT.lost(restore);
    case 'closed':
    case 'unbuilt': return TRAINING_TEXT.notYet;
    case 'affordable': return '';
    case 'dim': {
      if (cell.refusal === 'not-desk') return TRAINING_TEXT.status.notDesk;
      if (cell.refusal === 'needs-lower') {
        const parent = parentRow(cell.row);
        if (parent === null) throw new Error(`trainingModel: ${cell.skill} ${rowKey(cell.row)} needs nothing below it`);
        return TRAINING_TEXT.status.needsLower(parent.kind === 'version' ? `v${parent.version}` : cellName(cell.skill, parent));
      }
      if (cell.refusal === 'unaffordable') return TRAINING_TEXT.status.unaffordable(cell.price - bank);
      throw new Error(`trainingModel: a dim cell refused '${String(cell.refusal)}'`);
    }
  }
}

// Why a cell is not open yet (NOT YET's hover): the rule its branch opens by (skill-tree.ts latchedRuleDue), the next desk for
// the rows a branch open from the start shows from visit 2 (rowOpenAt), or a version this build lacks. null on an open cell.
function closedWhy(cell: Readonly<TreeCell>): string | null {
  if (cell.look === 'unbuilt') return TRAINING_TEXT.notYetWhy.unbuilt;
  if (cell.look !== 'closed') return null;
  const opens = SKILL_TREE[cell.skill].opens.kind;
  return TRAINING_TEXT.notYetWhy[opens === 'start' ? 'next-desk' : opens];
}

function cellView(state: Readonly<GameState>, cell: Readonly<TreeCell>, bank: number, sel: TrainingSel | null): TrainingCellView {
  const parent = parentRow(cell.row);
  const restore = cell.look === 'lost' ? restoreCost(state, cell.skill) : 0;
  return {
    key: cellKey(cell.skill, cell.row), skill: cell.skill, row: cell.row, look: cell.look, refusal: cell.refusal,
    price: cell.price, blocks: cell.blocks, name: cellName(cell.skill, cell.row),
    mode: cell.row.kind === 'version' ? SKILL_TREE[cell.skill].versions[cell.row.version - 1]!.mode : TRAINING_TEXT.lockMode,
    cost: cell.row.kind === 'version' ? TRAINING_TEXT.cellCost(cell.price, cell.blocks) : TRAINING_TEXT.lockCost(cell.price),
    nextShip: cell.row.kind === 'version' ? TRAINING_TEXT.skills[cell.skill].next[cell.row.version - 1]! : TRAINING_TEXT.nextLock[cell.row.level - 1]!,
    status: shortStatus(cell, bank, restore),
    why: closedWhy(cell),
    selected: sel !== null && sel.skill === cell.skill && sameRow(sel.row, cell.row),
    parent: parent === null ? null : cellKey(cell.skill, parent),
    lit: cell.look === 'owned' || cell.look === 'pending',
  };
}

// RESTORE's price for a skill now (decision 16): skill-levels.ts restoreCostOf, at what the unit holds.
export function restoreCost(state: Readonly<GameState>, skill: SkillId): number {
  return restoreCostOf(state, skill);
}

// The selection is armed: the kid picked it this visit ([1] / [2], ↑ ↓, a click: UiState.trainingArmed) on the open tab. The
// default selection only fills the detail (review M3).
export function trainingArmed(state: Readonly<GameState>): boolean {
  return state.ui.trainingArmed && state.ui.trainingSel !== null && state.ui.deskWindow === 'training';
}

// What TRAIN would do on a cell, or null when there is nothing to do there (held, pending, closed). Its key is shown only
// while the cell is armed.
function cellAction(state: Readonly<GameState>, cell: Readonly<TrainingCellView>, bank: number): TrainingAction | null {
  const action = cellActionBare(state, cell, bank);
  if (action === null || !trainingArmed(state)) return action;
  return { ...action, label: TRAINING_TEXT.enterKey(action.label) };
}

function cellActionBare(state: Readonly<GameState>, cell: Readonly<TrainingCellView>, bank: number): TrainingAction | null {
  const name = TRAINING_TEXT.skills[cell.skill].name;
  if (cell.look === 'lost') {
    const cost = restoreCost(state, cell.skill);
    const level = paid(state.run.skills, cell.skill);
    if (level === null) throw new Error(`trainingModel: ${cell.skill} is lost but was never paid for`);
    const enabled = cost <= bank && state.run.phase === 'desk';
    return {
      kind: 'restore', cost, label: TRAINING_TEXT.restore(level.version, cost), enabled,
      why: enabled ? null : TRAINING_TEXT.status.unaffordable(cost - bank), holdText: TRAINING_TEXT.restoring(name, level.version),
    };
  }
  if (cell.look !== 'affordable' && cell.look !== 'dim') return null;
  return {
    kind: 'train', cost: cell.price, label: TRAINING_TEXT.train(cell.price), enabled: cell.look === 'affordable',
    why: cell.look === 'affordable' ? null : cell.status,
    holdText: cell.row.kind === 'version' ? TRAINING_TEXT.training(name, cell.row.version, demoCount(state, cell.skill))
      : TRAINING_TEXT.trainingLock(LOCK_RANGE_TAC[cell.row.level]),
  };
}

// A skill's demos as the bar counts them (its kind from data/skills.ts: AUTOBURN's captures, AUTODROP's landings), or null
// for a skill with none (review m5: every skill's bar said `from your n captures`).
function demoCount(state: Readonly<GameState>, skill: SkillId): DemoCount | null {
  const kind = demoKindOf(skill);
  const demos = skillDemos(state.run.stats, skill);
  return kind === null || demos === null ? null : { count: demos.demos, kind };
}

// The head's demos: one count per demo kind a built skill of the tree learns from, in SKILL_IDS order.
function headDemos(state: Readonly<GameState>): DemoCount[] {
  const counts: DemoCount[] = [];
  for (const id of SKILL_IDS) {
    if (SKILL_TREE[id].built === 0) continue;
    const count = demoCount(state, id);
    if (count !== null && !counts.some((other) => other.kind === count.kind)) counts.push(count);
  }
  return counts;
}

// The cell's mini-demo, by data (TRAINING_DEMO_ART: a skill names its drawing per version and for LOCK RANGE).
function cellArt(skill: SkillId, row: CellRow): DemoArt {
  const art = TRAINING_DEMO_ART[skill];
  if (row.kind === 'version') return art.versions[row.version - 1]!;
  if (art.lock === null) throw new Error(`trainingModel: ${skill} has a LOCK RANGE cell but no lock art`);
  return art.lock;
}

function detailOf(state: Readonly<GameState>, cell: TrainingCellView, bank: number): TrainingDetail {
  const longCost = cell.row.kind === 'version'
    ? TRAINING_TEXT.detailCost(cell.price, cell.blocks) : TRAINING_TEXT.detailLockCost(cell.price, cell.blocks);
  return {
    cell,
    demo: cellArt(cell.skill, cell.row),
    lines: [cell.mode, longCost, cell.nextShip],
    status: cell.look === 'pending' ? TRAINING_TEXT.status.pendingLong : cell.status === '' ? null
      : cell.why === null ? cell.status : `${cell.status} · ${cell.why}`,
    action: cellAction(state, cell, bank),
  };
}

// The selection when the kid has made none (from visit 2): the first lost cell whose RESTORE the bank covers (what was lost
// comes back before another branch is bought: slice 4c–4e review, DROP's patch 3), else the first cell TRAIN could buy, else
// the first lost one, else the first one still to come; null on a grid with nothing open to buy. Display only: the default
// fills the detail and is never armed, so ENTER buys nothing on it (review M3; trainingArmed).
function defaultSel(state: Readonly<GameState>, cells: readonly TrainingCellView[], bank: number): TrainingSel | null {
  const pick = cells.find((cell) => cell.look === 'lost' && restoreCost(state, cell.skill) <= bank)
    ?? cells.find((cell) => cell.look === 'affordable') ?? cells.find((cell) => cell.look === 'lost')
    ?? cells.find((cell) => cell.look === 'dim');
  return pick === undefined ? null : { skill: pick.skill, row: pick.row };
}

function pendingText(purchase: Readonly<SkillPurchase>): string {
  const name = TRAINING_TEXT.skills[purchase.skill].name;
  if (purchase.kind === 'restore') return TRAINING_TEXT.pendingRestore(TRAINING_TEXT.cellName(name, purchase.to.version), purchase.cost);
  const what = purchase.kind === 'lock'
    ? `${name} ${TRAINING_TEXT.lockName(LOCK_RANGE_TAC[purchase.to.lock])}` : TRAINING_TEXT.cellName(name, purchase.to.version);
  return TRAINING_TEXT.pendingRow(what, purchase.cost);
}

export function trainingPending(pending: readonly SkillPurchase[]): TrainingPending[] {
  return pending.map((purchase, index) => ({
    index, text: pendingText(purchase),
    undoable: !pending.slice(index + 1).some((later) => later.skill === purchase.skill),
  }));
}

// --- The AHEAD row and the packet preview (03 §4) ----------------------------------------------------------------------

// The blocks the unit's skill files will take in the packet once this desk's purchases land (each at its held level).
export function heldSkillBlocks(state: Readonly<GameState>): number {
  return SKILL_IDS.reduce((sum, id) => {
    const level = held(state, id);
    return sum + (level === null ? 0 : skillBlocks(id, level.version, level.lock));
  }, 0);
}

// The preview's words from the fit the PACKET would have: the files and the skills, the limit that binds (the smaller of
// the link and the room, or whichever the files are over), and what is left for charge, or how far over it is. The warning
// colour below the charge floor; red when the files do not fit, with the cheapest way out.
export function packetPreview(fit: Readonly<RoomFit>, skills: number, tight: boolean, hint: string | null): TrainingPreview {
  const text = TRAINING_TEXT.preview;
  const head = text.head(Math.max(0, fit.files - skills), skills);
  if (fit.word === 'leave') {
    const binding = fit.overLink >= fit.over ? 'link' : 'room';
    const limit = binding === 'link' ? text.link(fit.link) : text.room(fit.room, tight);
    return { text: [head, limit, text.over(binding === 'link' ? fit.overLink : fit.over)].join(' · '), tone: 'over', binding, hint };
  }
  const binding = fit.link <= fit.room ? 'link' : 'room';
  const limit = binding === 'link' ? text.link(fit.link) : text.room(fit.room, tight);
  const tail = fit.chargeArrives === 0 ? text.noCharge : text.roomFor(fit.chargeArrives);
  return { text: [head, limit, tail].join(' · '), tone: fit.chargeArrives < CHARGE_ARRIVAL_FLOOR ? 'warn' : 'quiet', binding, hint: null };
}

// The cheapest way to make an over packet fit, named before the PACKET: undo a purchase made here, else the cheapest PACK
// AS that frees enough (skill-files.ts skillRelief, TREE's: cheapest RESTORE first), else leave files behind.
export function overHint(state: Readonly<GameState>, over: number): string {
  const text = TRAINING_TEXT.preview;
  if (state.run.skills.pending.length > 0) return text.hintUndo;
  const packs = skillRelief(state).filter((option) => option.level !== null);
  const pack = packs.find((option) => option.frees >= over) ?? packs[0];
  if (pack === undefined || pack.level === null) return text.hintLeave;
  return text.hintPack(TRAINING_TEXT.skills[pack.skill].name, pack.level.version, pack.frees);
}

function aheadLine(state: Readonly<GameState>, slot: number | null): string | null {
  if (slot === null) return null;
  const map = state.run.map;
  const ship = shipSummaryAt(map, slot);
  const hop = hopBetween(map, currentSlot(state.run), slot);
  const noise = `${NOISE_WORD[hop.noise]}${hop.noise > 0 ? ` ${hop.noise}` : ''}`;
  return TRAINING_TEXT.ahead(ship.name, ship.kind === 'ark', ship.pods, layoutFor(ship.memoryClass).totalBlocks, ship.memoryClass, noise);
}

// The fit is the SHIP CARD's (desk.ts cardModel, the same plan: the selected hop, the ladder's verdict for it, the
// deliveries riding it, nothing left behind or picked yet), through the one arrival preview.
// unitArrival reads this desk's pending purchases from the state (TREE's skillPacketPlan), so the fit counts the trained
// files at their new sizes and FILES = fit.files − the held skills' blocks. Nothing is packed lower at the desk.
function previewFor(state: Readonly<GameState>, slot: number | null): TrainingPreview | null {
  const map = state.run.map;
  const from = currentSlot(state.run);
  if (slot === null || !reachableFrom(map, from).includes(slot)) return null;
  const hop = hopBetween(map, from, slot);
  const verdict = planThreat(threatInputFor(state.run.threat, mapFacts(map, from, slot, map.route.length + 1), state.run.stats.deal !== null, finalTraceInput(state.run)));
  const fit = unitArrival(state, { hop, threat: verdict, dropped: [], pick: null, deliveries: deliveriesForHop(state, from, slot, verdict) }).fit;
  const tight = shipSummaryAt(map, slot).memoryClass === 'TIGHT';
  return packetPreview(fit, heldSkillBlocks(state), tight, fit.word === 'leave' ? overHint(state, Math.max(fit.over, fit.overLink)) : null);
}

// --- The model ---------------------------------------------------------------------------------------------------------

// This desk's purchases train some skill's v3 (ARRIVAL CONTROL's line, 03 §7): a 'train' to version 3, any skill.
function trainsV3(pending: readonly SkillPurchase[]): boolean {
  return pending.some((purchase) => purchase.kind === 'train' && purchase.to.version === 3);
}

export function trainingModel(state: Readonly<GameState>): TrainingModel {
  const run = state.run;
  const visit = visitNow(run);
  const bank = bankOf(run.skills);
  const sel = state.ui.trainingSel;
  const firstPick = isFirstDesk(run);
  const all = treeCells(state, visit).map((cell) => cellView(state, cell, bank, sel));
  const chosen = sel ?? (firstPick ? null : defaultSel(state, all, bank));
  const cells = sel === null && chosen !== null
    ? all.map((cell) => ({ ...cell, selected: cell.skill === chosen.skill && sameRow(cell.row, chosen.row) }))
    : all;
  const selected = cells.find((cell) => cell.selected) ?? null;

  const branches: TrainingBranch[] = [];
  const closed: TrainingClosed[] = [];
  for (const id of SKILL_IDS) {
    const mine = cells.filter((cell) => cell.skill === id);
    const open = mine.some((cell) => cell.look !== 'closed' && cell.look !== 'unbuilt');
    const words = TRAINING_TEXT.skills[id];
    if (!open) { closed.push({ name: `${words.branch} · ${words.name}`, why: mine.map(closedWhy).find((why) => why !== null) ?? TRAINING_TEXT.notYetWhy.unbuilt }); continue; }
    branches.push({
      skill: id, branch: words.branch, name: words.name, open, newest: false,
      versions: mine.filter((cell) => cell.row.kind === 'version'), locks: mine.filter((cell) => cell.row.kind === 'lock'),
    });
  }
  const newest = branches.at(-1);
  if (newest) newest.newest = true;

  const cards: TrainingCard[] = firstPick
    ? cells.filter((cell) => cell.row.kind === 'version' && cell.row.version === 1 && cell.look !== 'closed' && cell.look !== 'unbuilt')
      .map((cell, i) => ({
        key: String(i + 1), skill: cell.skill, name: cell.name, pitch: TRAINING_TEXT.skills[cell.skill].pitch,
        cost: TRAINING_TEXT.cardCost(cell.price, cell.blocks), trained: cell.look === 'owned' || cell.look === 'pending', demo: cellArt(cell.skill, cell.row),
        selected: cell.selected, refusal: cell.refusal,
      }))
    : [];

  // desk.ts firstPickWaits' rule (read here directly: desk.ts imports this file).
  const blocked = deskBlocker(state) !== null;
  const picked = firstPick && deskBlocker(state) === null;
  const topUp = firstPick
    ? run.skills.grants.filter((grant) => grant.source === 'first-pick').reduce((sum, grant) => sum + grant.cycles, 0) : 0;
  const lastSkills = run.lastUnit?.skills ?? null;
  const hold = state.ui.trainingHoldSec;
  const detail = selected === null ? null : detailOf(state, selected, bank);
  const slot = state.ui.deskSelected;
  return {
    visit, firstPick, armed: trainingArmed(state), title: TRAINING_TEXT.title, bank, bankText: TRAINING_TEXT.bank(bank),
    demos: TRAINING_TEXT.demos(headDemos(state)),
    control: firstPick ? TRAINING_TEXT.controlFirstVisit : trainsV3(run.skills.pending) ? TRAINING_TEXT.controlV3 : null,
    topUp: topUp > 0 ? TRAINING_TEXT.onTheHouse(topUp) : null,
    blocked, cards, branches, closed, cells, selected, detail,
    pending: trainingPending(run.skills.pending),
    saved: picked ? TRAINING_TEXT.saved(bank) : null,
    ahead: aheadLine(state, slot),
    aheadSite: surveyAheadLine(state, slot),
    preview: previewFor(state, slot),
    lastUnitLine: lastSkills === null || lastSkills.length === 0 ? null
      : TRAINING_TEXT.lastUnit(lastSkills.map((record) => TRAINING_TEXT.cellName(TRAINING_TEXT.skills[record.skill].name, record.version))),
    hold: hold === null ? null : Math.min(1, Math.max(0, hold / TRAINING_HOLD_SEC)),
    holdText: hold === null ? null : detail?.action?.holdText ?? null,
  };
}

// --- The LANDING REPORT's cycles line (plan §1.1 4a item 1, §2.4) -------------------------------------------------------

export interface CyclesReport {
  total: number;               // what the ship pays (1..6), the line's rolling number
  line: string;                // TRAINING CYCLES +5 · ARRIVED +1 · LANDED 83% +4 / PERFECT LANDING · +6 / … NO DESK AHEAD
  lineAt: (shown: number) => string;   // the same line while it rolls up to `total`
  topUp: string | null;        // a run's first ship below the first-pick floor: +2 CYCLES
}

// The line from what the ship earns (run-score.ts shipCycles), the ship being the final one (decision 18: shown, it does
// nothing), and the bank before it (a run's first ship tops it up to the first-pick floor at the desk: said here first).
export function cyclesReport(earning: Readonly<CycleEarning>, finalShip: boolean, firstShip: boolean): CyclesReport {
  const total = earning.arrived + earning.landed;
  const lineAt = (shown: number): string => {
    if (finalShip) return TRAINING_TEXT.report.noDesk(shown);
    if (earning.landed === CYCLES_LANDED_STEPS) return TRAINING_TEXT.report.perfect(shown);
    return TRAINING_TEXT.report.cycles(shown, earning.pct, Math.max(0, shown - earning.arrived));
  };
  const short = FIRST_PICK_FLOOR_CYCLES - total;
  return { total, line: lineAt(total), lineAt, topUp: firstShip && !finalShip && short > 0 ? TRAINING_TEXT.onTheHouse(short) : null };
}
