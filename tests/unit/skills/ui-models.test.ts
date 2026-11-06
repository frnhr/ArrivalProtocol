// Slice 4 Track UI (plan §6): the skill tree's UI models, pure or store level, about a second.
// • trainingModel at the run's first desk (the real desk after ARES-VII's report): the cards (AUTOBURN v1 alone, plan
//   risk R5), ARRIVAL CONTROL's line, SET COURSE waiting; the TRAIN bar (select, hold, advance past TRAINING_HOLD_SEC: the
//   real trainCell lands it), then the TRAINED card, `n CYCLES · SAVED FOR NEXT TIME`, the UNDO row; the desk's A SKILL step
//   and the tab's badge; UNDO gives it back.
// • From visit 2 (a migrated desk carrying phase 2's AUTOBURN): the grid (FLIGHT open, the other three one OPENS LATER row
//   each), the cells' looks and words, the trace parents, the default selection and its detail; the file eaten: LOST ·
//   RESTORE 2 and RESTORE in the detail.
// • The packet preview's words on crafted fits (the binding limit: LINK, ROOM · TIGHT; ROOM FOR n CHARGE, NO CHARGE ARRIVES,
//   n BLOCKS OVER) and the AHEAD row.
// • The LANDING REPORT's cycles line (the roll, PERFECT LANDING, NO DESK AHEAD, the first pick's top-up on a crash).
// • Graded damage as the MIND and the Skills window show it: the labelled ticks per version, a file's badge and INSPECT
//   line, offline read first, the Skills row's version line and its RESTORE prompt, the version stamps.
// • Every TRAINING_TEXT line with worst-case numbers fits MAX_LINE_CHARS and says no word 03 §4's glossary rules out.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { RoomFit } from '@/types/map';
import type { SkillFileSegment } from '@/types/segment';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import {
  trainingModel, packetPreview, cyclesReport, heldSkillBlocks, TRAINING_HOLD_SEC, type TrainingModel,
} from '@systems/training-model';
import {
  deskSteps, deskTabBadges, selectTrainingCell, startTrainingHold, advanceTrainingHold, undoTraining, firstPickWaits,
  openDeskWindow, selectShip, deskCandidates, deskEnter, disarmTraining, stepTrainingCell,
} from '@systems/desk';
import { setCourse, transmitNext, backToChart } from '@systems/run';
import { pickCard } from '@systems/draft';
import { trainCell } from '@systems/training';
import { createRunMap } from '@systems/map-run';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { skillsModel, skillFileView, skillTickZones, skillVersionStamp } from '@systems/skills';
import { bankOf } from '@systems/skill-tree';
import { skillFile } from '@systems/skill-files';
import { resumeRun } from '@systems/run-save';
import { freeSegment, mergeAdjacentFree, segmentStarts, replaceRange } from '@systems/memory-ops';
import { TRAINING_TEXT } from '@data/training-text';
import { SKILLS_TEXT } from '@data/script';
import { MAX_LINE_CHARS, RUN_SAVE_KEY, META_STORAGE_KEY, TACTICAL_LEAD_BURN_TAC } from '@data/tuning';
import { stubStorage, pageOpen, receiveToReport, toDesk } from '../save/save-fixture';
import { giveSkillFile } from '../support/skills';

void TACTICAL_LEAD_BURN_TAC;
const text = (model: Readonly<TrainingModel>, key: string): string | undefined => model.cells.find((cell) => cell.key === key)?.status;
const look = (model: Readonly<TrainingModel>, key: string): string | undefined => model.cells.find((cell) => cell.key === key)?.look;

// --- Desk 1: the required first pick --------------------------------------------------------------------------------------
{
  const storage = stubStorage();
  const store = createStore<GameState>(createInitialState({ seed: 7 }));
  pageOpen(store, storage, 7);
  receiveToReport(store);
  toDesk(store);
  const bank = bankOf(store.getState().run.skills);
  let model = trainingModel(store.getState());
  check('desk 1 opens on TRAINING (run.ts deskUiOnOpen) and its model is the first pick: one card, AUTOBURN v1, `3 CYCLES · 6 BLOCKS`',
    store.getState().ui.deskWindow === 'training' && model.firstPick && model.cards.length === 1 && model.cards[0]!.name === 'AUTOBURN v1'
      && model.cards[0]!.cost === '3 CYCLES · 6 BLOCKS' && model.cards[0]!.key === '1' && !model.cards[0]!.trained, JSON.stringify(model.cards));
  check('…ARRIVAL CONTROL: `Training outside approved hours is discouraged. :)`, the head `TRAINING · UNIT-047` and the bank',
    model.control === TRAINING_TEXT.controlFirstVisit && model.title === 'TRAINING · UNIT-047' && model.bankText === TRAINING_TEXT.bank(bank) && bank >= 3);
  check('…SET COURSE waits (firstPickWaits), the strip\'s first step is A SKILL, the tab\'s badge names the cycles',
    model.blocked && firstPickWaits(store.getState()) && deskSteps(store.getState())[0]!.id === 'train' && !deskSteps(store.getState())[0]!.done
      && deskSteps(store.getState())[0]!.text === TRAINING_TEXT.stepText && deskTabBadges(store.getState()).training === TRAINING_TEXT.badge(bank));
  check('…no card chosen yet: no detail, TRAIN not offered', model.selected === null && model.detail === null && !startTrainingHold(store));
  selectTrainingCell(store, 'autoburn', { kind: 'version', version: 1 });
  model = trainingModel(store.getState());
  const captures = store.getState().run.stats.demos.length;
  check('[1]: the card is chosen and armed, TRAIN ▸ 3 CYCLES [ENTER] is offered, ENTER trains', model.cards[0]!.selected && model.armed
    && model.detail?.action?.kind === 'train' && model.detail.action.enabled && model.detail.action.label === TRAINING_TEXT.enterKey(TRAINING_TEXT.train(3))
    && deskEnter(store.getState()) === 'train');
  check('…TRAIN starts the bar: `TRAINING AUTOBURN v1 · …` at 0', startTrainingHold(store) && trainingModel(store.getState()).hold === 0
    && trainingModel(store.getState()).holdText === TRAINING_TEXT.training('AUTOBURN', 1, { count: captures, kind: 'captures' }));
  const half = advanceTrainingHold(store, TRAINING_HOLD_SEC / 2);
  check('…half way it is still filling, nothing bought', half === 'filling' && Math.abs((trainingModel(store.getState()).hold ?? 0) - 0.5) < 1e-9
    && store.getState().run.skills.pending.length === 0);
  const done = advanceTrainingHold(store, TRAINING_HOLD_SEC);
  model = trainingModel(store.getState());
  check('…full: trainCell buys it (pending), the card is stamped TRAINED, the bar is gone', done === 'done' && model.hold === null
    && store.getState().run.skills.pending.length === 1 && model.cards[0]!.trained && look(model, 'autoburn:v1') === 'pending');
  check(`…the counter: \`${TRAINING_TEXT.saved(bank - 3)}\` and MORE SKILLS OPEN AS YOU GO; the UNDO row`, model.saved === TRAINING_TEXT.saved(bank - 3)
    && model.moreLater === TRAINING_TEXT.moreLater && model.pending.length === 1 && model.pending[0]!.undoable
    && model.pending[0]!.text === TRAINING_TEXT.pendingRow('AUTOBURN v1', 3));
  check('…SET COURSE no longer waits; A SKILL is done and names the pick', !firstPickWaits(store.getState()) && deskSteps(store.getState())[0]!.done
    && deskSteps(store.getState())[0]!.text === TRAINING_TEXT.stepDone('AUTOBURN', 1));
  const ship = deskCandidates(store.getState())[0]!;
  selectShip(store, ship);
  model = trainingModel(store.getState());
  check('a ship picked on the chart: the AHEAD row names it, the preview counts the trained file (SKILLS 6) and names a limit',
    model.ahead.startsWith('NEXT: ') && !model.ahead.includes('PICK A SHIP') && model.preview !== null
      && model.preview.text.includes('SKILLS 6') && /LINK|ROOM/.test(model.preview.text) && heldSkillBlocks(store.getState()) === 6, JSON.stringify([model.ahead, model.preview]));
  undoTraining(store, 0);
  model = trainingModel(store.getState());
  check('UNDO gives it back: nothing pending, the bank whole, the card chosen again, SET COURSE waits again',
    store.getState().run.skills.pending.length === 0 && bankOf(store.getState().run.skills) === bank && model.cards[0]!.selected
      && !model.cards[0]!.trained && firstPickWaits(store.getState()));
  openDeskWindow(store, null);
  check('openDeskWindow: back to the card and to TRAINING again', store.getState().ui.deskWindow === null
    && (openDeskWindow(store, 'training'), store.getState().ui.deskWindow === 'training'));
}

// --- From visit 2: the grid ----------------------------------------------------------------------------------------------
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'save', 'fixtures');
{
  const { save, meta } = JSON.parse(readFileSync(join(FIXTURES, 'run-save-v1-ship-done-autoburn.json'), 'utf8'));
  const storage = stubStorage({ [RUN_SAVE_KEY]: JSON.stringify(save), [META_STORAGE_KEY]: JSON.stringify(meta) });
  const store = createStore<GameState>(createInitialState({ seed: 1 }));
  pageOpen(store, storage, 1);
  resumeRun(store);
  store.update((d) => { d.run.skills.grants.push({ source: 'story', cycles: 8, visit: 2, label: null }); });
  let model = trainingModel(store.getState());
  const branches = model.branches.map((branch) => `${branch.branch}:${branch.versions.length}+${branch.locks.length}`).join();
  // The branches and the closed list: Track DROP edits this check when AUTODROP's branch opens (review M1).
  check('desk 2: the grid, FLIGHT open (v1–v3 and LOCK RANGE beside), the three others one OPENS LATER row each',
    !model.firstPick && model.cards.length === 0 && branches === 'FLIGHT:3+2'
      && model.closed.join() === 'LANDING · AUTODROP,SURVEY · SURVEY,DEFENCE · SENTRY', `${branches} ${model.closed.join()}`);
  // (end of DROP's check)
  // AUTOBURN's cells: Track ORBIT edits this check when AUTOBURN v3 is built (v3 stops reading OPENS LATER).
  check('…v1 TRAINED (owned), v2 affordable (`5 · 8`), v3 OPENS LATER (not built), LOCK 270 affordable (`1 · +1`), LOCK 810 NEEDS LOCK 270 FIRST',
    look(model, 'autoburn:v1') === 'owned' && text(model, 'autoburn:v1') === TRAINING_TEXT.status.owned
      && look(model, 'autoburn:v2') === 'affordable' && model.cells.find((c) => c.key === 'autoburn:v2')?.cost === '5 · 8'
      && text(model, 'autoburn:v3') === TRAINING_TEXT.opensLater && look(model, 'autoburn:L1') === 'affordable'
      && model.cells.find((c) => c.key === 'autoburn:L1')?.cost === '1 · +1' && text(model, 'autoburn:L2') === TRAINING_TEXT.status.needsLower('LOCK 270'),
    model.cells.map((c) => `${c.key}:${c.look}:${c.status}`).join(' | '));
  check('…the traces: v2 hangs from v1, LOCK 270 from v1, LOCK 810 from LOCK 270; v1\'s is lit',
    model.cells.find((c) => c.key === 'autoburn:v2')?.parent === 'autoburn:v1' && model.cells.find((c) => c.key === 'autoburn:L1')?.parent === 'autoburn:v1'
      && model.cells.find((c) => c.key === 'autoburn:L2')?.parent === 'autoburn:L1' && model.cells.find((c) => c.key === 'autoburn:v1')?.lit === true);
  check('…the default selection is the first cell TRAIN can buy (v2), its detail: mode, price and size, NEXT SHIP, TRAIN',
    model.selected?.key === 'autoburn:v2' && model.detail?.lines[0] === 'GREEN, THEN ROUND' && model.detail.lines[1] === TRAINING_TEXT.detailCost(5, 8)
      && model.detail.lines[2] === TRAINING_TEXT.skills.autoburn.next[1] && model.detail.action?.label === TRAINING_TEXT.train(5), JSON.stringify(model.detail));
  check('…no CONTROL line, no top-up, no SAVED line past visit 1', model.control === null && model.topUp === null && model.saved === null);
  selectTrainingCell(store, 'autoburn', { kind: 'lock', level: 1 });
  startTrainingHold(store);
  const result = advanceTrainingHold(store, TRAINING_HOLD_SEC + 0.1);
  model = trainingModel(store.getState());
  check('LOCK 270 trained through the bar: pending, `TRAINED HERE`, LOCK 810 now affordable, the row reads `AUTOBURN LOCK 270 · 1 CYCLE`',
    result === 'done' && look(model, 'autoburn:L1') === 'pending' && text(model, 'autoburn:L1') === TRAINING_TEXT.status.pending
      && look(model, 'autoburn:L2') === 'affordable' && model.pending[0]?.text === TRAINING_TEXT.pendingRow('AUTOBURN LOCK 270', 1),
    JSON.stringify(model.pending));
  undoTraining(store, 0);
  // The file eaten: v1 was paid for (the migration's free purchase) and is no longer held.
  const memory = store.getState().memory;
  const index = memory.findIndex((seg) => seg.type === 'upgrade' && seg.upgrade === 'autoburn');
  const addr = segmentStarts(memory)[index]!;
  replaceRange(memory, addr, addr + memory[index]!.size, [freeSegment(memory[index]!.size)], { opId: null, own: [memory[index]!] });
  mergeAdjacentFree(memory);
  store.update((d) => { d.ui.trainingSel = null; });
  model = trainingModel(store.getState());
  check('the file eaten: v1 reads `LOST · RESTORE 2`, v2 NEEDS v1 FIRST, and the default selection is v1 with RESTORE v1 ▸ 2 CYCLES',
    look(model, 'autoburn:v1') === 'lost' && text(model, 'autoburn:v1') === TRAINING_TEXT.lost(2)
      && text(model, 'autoburn:v2') === TRAINING_TEXT.status.needsLower('v1') && model.selected?.key === 'autoburn:v1'
      && model.detail?.action?.kind === 'restore' && model.detail.action.label === TRAINING_TEXT.restore(1, 2) && model.detail.action.enabled,
    model.cells.map((c) => `${c.key}:${c.look}:${c.status}`).join(' | '));
  const rows = skillsModel(store.getState());
  check('…and the Skills row says so: ▯▯▯, `LOST v1 · RESTORE 2 AT THE NEXT DESK`', rows[0]?.id === 'autoburn'
    && rows[0].version?.pips === '▯▯▯' && rows[0].version.text === SKILLS_TEXT.skill.restoreAt(1, 2) && rows[0].version.tone === 'warn',
    JSON.stringify(rows[0]?.version));
}

// --- Review M3 / M4: the desk's keys at desk 2, at the model ------------------------------------------------------------
// ENTER trains only a cell picked this visit ([1]/[2], ↑ ↓, a click); the default selection fills the detail and is not armed;
// ESC and another tab disarm; a dim armed cell buzzes; SET COURSE while the bar fills cancels it, and nothing lands after
// ◀ CHART either.
{
  const storage = stubStorage();
  const store = createStore<GameState>(createInitialState({ seed: 3, map: createRunMap({ wave: 1 }, 3), lineage: FIRST_RUN_LINEAGE }));
  pageOpen(store, storage, 3);
  receiveToReport(store);
  store.update((d) => { d.run.stats.demos = [{ offsetTac: 2 }]; });
  toDesk(store);
  trainCell(store, 'autoburn', { kind: 'version', version: 1 });
  setCourse(store, deskCandidates(store.getState())[0]!);
  const offer = store.getState().run.transit!.offer;
  if (offer.length > 0) pickCard(store, offer.some((card) => card.id === 'charge') ? 'charge' : offer[0]!.id);
  transmitNext(store);
  toDesk(store);
  const slot = deskCandidates(store.getState())[0]!;
  selectShip(store, slot);
  openDeskWindow(store, 'training');
  const course = (): string => deskSteps(store.getState()).find((step) => step.id === 'set-course')!.text;
  let model = trainingModel(store.getState());
  const bank = bankOf(store.getState().run.skills);
  check('M3: desk 2, TRAINING open: the default selection fills the detail, unarmed: TRAIN has no key, ENTER sets course',
    model.selected !== null && model.detail?.action !== null && !model.armed && !(model.detail?.action?.label ?? '').includes('[ENTER]')
      && deskEnter(store.getState()) === 'set-course' && course().endsWith('[ENTER]'), `${model.selected?.key} bank ${bank} ${model.detail?.action?.label} "${course()}"`);
  stepTrainingCell(store, 1);
  model = trainingModel(store.getState());
  const armedAction = model.detail?.action ?? null;
  check('…↓ picks a cell: armed; with an action ENTER trains it, its label carries [ENTER], and the step says SET COURSE [SPACE]',
    model.armed && (armedAction === null ? deskEnter(store.getState()) === 'set-course'
      : deskEnter(store.getState()) === 'train' && armedAction.label.endsWith('[ENTER]') && course().endsWith('[SPACE]')),
    `${model.selected?.key} ${armedAction?.label} "${course()}"`);
  disarmTraining(store);
  check('…ESC disarms: the selection stays on screen, ENTER sets course', !trainingModel(store.getState()).armed
    && trainingModel(store.getState()).selected?.key === model.selected?.key && deskEnter(store.getState()) === 'set-course');
  // A cell the bank can't pay, picked: ENTER buzzes (startTrainingHold refuses), never sets course behind the kid's back.
  const dim = trainingModel(store.getState()).cells.find((cell) => cell.look === 'dim');
  if (dim !== undefined) {
    selectTrainingCell(store, dim.skill, dim.row);
    check('…a dim cell picked: ENTER is TRAIN\'s and buzzes (no bar)', deskEnter(store.getState()) === 'train' && !startTrainingHold(store)
      && store.getState().ui.trainingHoldSec === null, dim.key);
  }
  openDeskWindow(store, null);
  check('…another tab disarms', !store.getState().ui.trainingArmed && deskEnter(store.getState()) === 'set-course');
  openDeskWindow(store, 'training');
  check('…and back on TRAINING it stays unarmed until a pick', deskEnter(store.getState()) === 'set-course');
  // SET COURSE while a bar fills (M4).
  const affordable = trainingModel(store.getState()).cells.find((cell) => cell.look === 'affordable');
  check('setup: a cell the bank can buy at desk 2', affordable !== undefined, String(bank));
  if (affordable !== undefined) {
    selectTrainingCell(store, affordable.skill, affordable.row);
    check('M4 setup: TRAIN starts the bar', startTrainingHold(store) && advanceTrainingHold(store, TRAINING_HOLD_SEC / 2) === 'filling');
    setCourse(store, slot);
    check('M4: SET COURSE mid-bar: the bar stops, nothing pending, TRAINING unarmed', store.getState().run.phase === 'transmit'
      && store.getState().ui.trainingHoldSec === null && store.getState().run.skills.pending.length === 0 && !store.getState().ui.trainingArmed);
    backToChart(store);
    check('…◀ CHART: no bar to resume, no ghost purchase, the bank whole', store.getState().ui.trainingHoldSec === null
      && store.getState().run.skills.pending.length === 0 && bankOf(store.getState().run.skills) === bank && deskEnter(store.getState()) === 'set-course');
  }
}

// --- The packet preview and the AHEAD row (03 §4) ---------------------------------------------------------------------------
{
  const fit = (over: Partial<RoomFit>): RoomFit => ({
    files: 75, link: 117, room: 152, floor: 12, carried: 42, bonus: 0, wanted: 42, floorAdded: 0, seedsMin: 0, seedsMax: 0,
    chargeArrives: 42, chargeArrivesMin: 42, linkLost: 0, roomLost: 0, over: 0, overLink: 0, word: 'fits', ...over,
  });
  const fits = packetPreview(fit({}), 9, false, null);
  check('the walk\'s desk 2: `FILES 66 + SKILLS 9 · LINK 117 · ROOM FOR 42 CHARGE` (the link binds), quiet',
    fits.text === 'FILES 66 + SKILLS 9 · LINK 117 · ROOM FOR 42 CHARGE' && fits.binding === 'link' && fits.tone === 'quiet', fits.text);
  const overLink = packetPreview(fit({ files: 89, link: 86, word: 'leave', overLink: 3, over: 0 }), 17, false, 'HINT');
  check('over the link: `FILES 72 + SKILLS 17 · LINK 86 · 3 BLOCKS OVER`, red, with the hint',
    overLink.text === 'FILES 72 + SKILLS 17 · LINK 86 · 3 BLOCKS OVER' && overLink.tone === 'over' && overLink.hint === 'HINT', overLink.text);
  const tight = packetPreview(fit({ files: 88, link: 120, room: 88, floor: 0, chargeArrives: 0, word: 'no-charge' }), 20, true, null);
  check('into a TIGHT ship: `FILES 68 + SKILLS 20 · ROOM 88 · TIGHT · NO CHARGE ARRIVES`, in the warning colour',
    tight.text === 'FILES 68 + SKILLS 20 · ROOM 88 · TIGHT · NO CHARGE ARRIVES' && tight.binding === 'room' && tight.tone === 'warn', tight.text);
  const overRoom = packetPreview(fit({ files: 96, link: 120, room: 88, floor: 0, word: 'leave', over: 8, overLink: 0 }), 20, true, null);
  check('over a TIGHT room: `… · ROOM 88 · TIGHT · 8 BLOCKS OVER`', overRoom.text === 'FILES 76 + SKILLS 20 · ROOM 88 · TIGHT · 8 BLOCKS OVER'
    && overRoom.binding === 'room', overRoom.text);
  check('below the floor it warns (`ROOM FOR 9 CHARGE`); one block is `1 BLOCK OVER`',
    packetPreview(fit({ chargeArrives: 9 }), 9, false, null).tone === 'warn'
      && packetPreview(fit({ word: 'leave', overLink: 1 }), 9, false, null).text.endsWith('1 BLOCK OVER'));
  check('AHEAD with no ship picked asks for one', TRAINING_TEXT.aheadNone.startsWith('NEXT: PICK A SHIP'));
}

// --- The LANDING REPORT's cycles line ----------------------------------------------------------------------------------------
{
  const line = cyclesReport({ slot: 0, arrived: 1, landed: 4, pct: 83 }, false, false);
  check('`TRAINING CYCLES +5 · ARRIVED +1 · LANDED 83% +4`, rolling up from +0', line.line === 'TRAINING CYCLES +5 · ARRIVED +1 · LANDED 83% +4'
    && line.total === 5 && line.lineAt(0) === 'TRAINING CYCLES +0 · ARRIVED +1 · LANDED 83% +0' && line.lineAt(3) === 'TRAINING CYCLES +3 · ARRIVED +1 · LANDED 83% +2'
    && line.topUp === null, line.line);
  check('every point: `PERFECT LANDING · +6`', cyclesReport({ slot: 0, arrived: 1, landed: 5, pct: 100 }, false, false).line === 'PERFECT LANDING · +6');
  check('the final ship: `+5 TRAINING CYCLES · NO DESK AHEAD` (decision 18: shown, does nothing)',
    cyclesReport({ slot: 19, arrived: 1, landed: 4, pct: 85 }, true, false).line === '+5 TRAINING CYCLES · NO DESK AHEAD');
  const crash = cyclesReport({ slot: 0, arrived: 1, landed: 0, pct: 0 }, false, true);
  check('a crash on the run\'s first ship: +1, then `+2 CYCLES · FIRST SKILL ON THE HOUSE :)`', crash.total === 1
    && crash.topUp === '+2 CYCLES · FIRST SKILL ON THE HOUSE :)' && cyclesReport({ slot: 2, arrived: 1, landed: 0, pct: 0 }, false, false).topUp === null);
}

// --- Graded damage on screen (03 §3.5, §4) ------------------------------------------------------------------------------------
{
  const labels = (version: 1 | 2 | 3): string => [...skillTickZones(version)].reverse().map((zone) => zone.label).join(' | ');
  const v2 = skillTickZones(2);
  check('the ticks keep `v3 | v2 | v1 | off`, `v2 | v1 | off`, `v1 | off`, at 80, 50 and 25',
    labels(3) === 'v3 | v2 | v1 | off' && labels(2) === 'v2 | v1 | off' && labels(1) === 'v1 | off'
      && v2.map((zone) => `${zone.from}-${zone.to}`).join() === '0-50,50-80,80-100', `${labels(3)} / ${JSON.stringify(v2)}`);
  let n = 0;
  const file = (version: 1 | 2 | 3, lock: 0 | 1 | 2, integrity: number, state?: SkillFileSegment['state']): SkillFileSegment => {
    const seg = skillFile('autoburn', { version, lock }, (prefix) => `${prefix}${++n}`);
    seg.integrity = integrity;
    if (state !== undefined) seg.state = state;
    return seg;
  };
  const bitten = skillFileView(file(2, 1, 64));
  check('the walk\'s bite: a v2 + 270 at 64% badges `v2▸v1` and INSPECT reads `v2 · 64% · WORKS AS v1 · REPAIR TO 80% FOR v2 (≈ 3 CHARGE)`',
    bitten.badge === 'v2▸v1' && bitten.damaged && bitten.works === 1
      && bitten.inspect === 'v2 · 64% · WORKS AS v1 · REPAIR TO 80% FOR v2 (≈ 3 CHARGE)', bitten.inspect);
  const healthy = skillFileView(file(2, 0, 100));
  check('…healthy: `v2`, no repair line', healthy.badge === 'v2' && !healthy.damaged && healthy.repair === null && healthy.inspect === 'v2 · 100% · WORKS AS v2');
  const repairing = skillFileView(file(2, 0, 60, 'repairing'));
  check('…under REPAIR it is offline, read first: `v2`, OFF WHILE IT IS REPAIRED (not dead, not v2▸off)',
    repairing.badge === 'v2' && repairing.offline === 'repairing' && !repairing.damaged && repairing.worksText === SKILLS_TEXT.skill.offline.repairing);
  check('…a v2 at 30% no longer works: `v2▸off`', skillFileView(file(2, 0, 30)).badge === 'v2▸off');

  const store = createStore<GameState>(createInitialState({ seed: 3 }));
  check('no skill: no skill row', skillsModel(store.getState()).every((row) => row.id !== 'autoburn'));
  const seg = giveSkillFile(store, 'autoburn', 2, 1);
  let row = skillsModel(store.getState())[0];
  check('AUTOBURN v2 + 270, healthy: the row\'s pips `▮▮▯`, `v2 · LOCK 270`, good', row?.version?.pips === '▮▮▯'
    && row.version.text === 'v2 · LOCK 270' && row.version.tone === 'good', JSON.stringify(row?.version));
  store.update((d) => { const f = d.memory.find((s) => s.id === seg.id) as SkillFileSegment; f.integrity = 64; });
  row = skillsModel(store.getState())[0];
  check('…at 64%: the status (FLIGHT\'s) says `WORKS AS v1 — REPAIR IT FOR v2`, the version line `v2 · LOCK 270 · REPAIR TO 80% FOR v2 (≈ 3 CHARGE)`, warn',
    row?.status.startsWith('WORKS AS v1') === true && row.version?.text === 'v2 · LOCK 270 · REPAIR TO 80% FOR v2 (≈ 3 CHARGE)' && row.version.tone === 'warn', `${row?.status} / ${row?.version?.text}`);
  check('the stamps: a step down `AUTOBURN v2 → v1` (danger, the falling sweep); back up `AUTOBURN v2 RESTORED` (the sparkle)',
    skillVersionStamp(store.getState(), 'autoburn', 2, 1)?.text === 'AUTOBURN v2 → v1' && skillVersionStamp(store.getState(), 'autoburn', 2, 1)?.sound === 'down'
      && (store.update((d) => { (d.memory.find((s) => s.id === seg.id) as SkillFileSegment).integrity = 100; }),
        skillVersionStamp(store.getState(), 'autoburn', 1, 2)?.text === 'AUTOBURN v2 RESTORED')
      && skillVersionStamp(store.getState(), 'autoburn', 1, 2)?.tone === 'good');
  store.update((d) => { (d.memory.find((s) => s.id === seg.id) as SkillFileSegment).state = 'repairing'; });
  check('…a fall to OFF because the kid repairs it stamps nothing', skillVersionStamp(store.getState(), 'autoburn', 2, 0) === null);
}

// --- The words -------------------------------------------------------------------------------------------------------------
{
  const T = TRAINING_TEXT;
  const lines = [
    T.badge(54), T.title('UNIT-999'), T.demos([{ count: 999, kind: 'captures' }, { count: 999, kind: 'drops' }]), T.demos([]),
    T.chooseFirst, T.stepText, T.stepDone('AUTODROP', 3), T.controlFirstVisit,
    T.onTheHouse(2), T.saved(54), T.moreLater, T.opensLater, T.lost(27), T.cardCost(8, 12), T.enterKey(T.train(8)),
    T.training('AUTOBURN', 3, { count: 999, kind: 'captures' }), T.training('AUTODROP', 3, { count: 999, kind: 'drops' }),
    T.training('AUTOBURN', 1, { count: 0, kind: 'captures' }), T.training('SENTRY', 3, null), T.trainingLock(810), T.enterKey(T.restore(3, 27)), T.restoring('AUTOBURN', 3), T.detailCost(8, 12), T.detailLockCost(2, 12),
    T.status.pendingLong, T.status.needsLower('LOCK 270'), T.status.unaffordable(8), ...T.nextLock,
    ...Object.values(T.skills).flatMap((words) => [words.pitch, ...words.next]),
    T.pendingRow('AUTOBURN LOCK 810', 8), T.pendingRestore('AUTOBURN v3', 27),
    T.ahead('GOOD HOPE', true, 16, 384, 'COMPACT', 'SEVERE 3'), T.aheadNone,
    [T.preview.head(999, 34), T.preview.room(152, true), T.preview.over(999)].join(' · '),
    [T.preview.head(999, 34), T.preview.link(999), T.preview.roomFor(999)].join(' · '),
    T.preview.hintPack('AUTOBURN', 2, 12), T.preview.hintUndo, T.preview.hintLeave,
    T.lastUnit(['AUTOBURN v3', 'AUTODROP v3', 'SENTRY v3']),
    T.report.cycles(6, 100, 5), T.report.perfect(6), T.report.noDesk(6), T.runEnd.tally(54, 54, 999),
    SKILLS_TEXT.skill.restoreAt(3, 27), SKILLS_TEXT.skill.stampDown('AUTODROP', 3, 0), SKILLS_TEXT.skill.stampRestored('AUTODROP', 3),
    SKILLS_TEXT.skill.repairFor(80, 3, 99),
  ];
  const long = lines.filter((line) => line.length > MAX_LINE_CHARS);
  check(`every TRAINING line fits ${MAX_LINE_CHARS} characters with worst-case numbers (${lines.length} lines)`, long.length === 0, long.join(' | '));
  // 03 §4's glossary: TRAINING never says "tech tree", CYCLES never "XP" or "points", a SKILL never "upgrade".
  const banned = lines.filter((line) => /tech tree|\bXP\b|\bpoints?\b|upgrade/i.test(line));
  check('…and none says a word the glossary rules out (tech tree, XP, points, upgrade)', banned.length === 0, banned.join(' | '));
}

finish();
