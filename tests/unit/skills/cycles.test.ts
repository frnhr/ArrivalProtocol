// Slice 4 Track TREE (plan §6): training cycles, store level, under a second.
// • endShip pays every ship its cycles (run-score.ts shipCycles), on the arm and the classic world, one earning per ship.
// • The first-pick floor (03 §3.1): a crashed ship 1 (1 earned) gets `+2 CYCLES · FIRST SKILL ON THE HOUSE :)` at the run's
//   first desk, written before SHIP DONE's save; a good ship 1 gets none; a run that already paid for a skill gets none and
//   is not asked to pick. Only on the arm, only at visit 1.
// • The +2 CYCLES salvage card: dealt only with a tree (never on the classic world: its deals byte-identical), never into a
//   final ship; picked, it becomes a 'salvage' grant at TRANSMIT ▸, never a carried card.
// • RUN END: `UNSPENT n` and the RUN TALLY's `TRAINED n of 54 · UNSPENT n` (lost levels still count as trained); none on
//   the classic world.
// • The archive (03 §3.11): LastUnit.skills at RUN END, each skill's file level and AUTOBURN's accuracy, through the real
//   archive write and back through the parser.
import '../support/classic-world';
import { check, finish } from '../landing/checks';
import { createStore, type Store } from '@state/store';
import type { GameState } from '@state/schema';
import { createInitialState } from '@state/initial';
import { createRunMap, shipSummaryAt } from '@systems/map-run';
import { endShip, openDesk, endRun, transmitNext, setCourse } from '@systems/run';
import { setCourseFromDesk } from '../support/desk';
import { giveSkillFile, pickFirstSkill } from '../support/skills';
import { bankOf, deskBlocker, trainedCycles, skillRecords, grantCycles } from '@systems/skill-tree';
import { draftContext, pickCard } from '@systems/draft';
import { draftEntries, getUpgrade } from '@data/upgrades';
import { runEndModel } from '@systems/run-end';
import { parseLastUnit } from '@systems/meta-parse';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { TRAINING_TEXT } from '@data/training-text';
import { RUN_SAVE_KEY } from '@data/tuning';
import { armRun, toDesk } from '../map/repo-fixture';
import { stubStorage, pageOpen, receiveToReport, storedMeta } from '../save/save-fixture';
import { CYCLES_CARD_CYCLES, FIRST_PICK_FLOOR_CYCLES } from '@data/tuning';

const throws = (run: () => unknown): boolean => { try { run(); return false; } catch { return true; } };

// --- Earnings -----------------------------------------------------------------------------------------------------------
{
  const store = armRun();
  endShip(store, 'crashed');
  const earned = store.getState().run.skills.earned;
  check('endShip pays the ship its cycles: a crash with nobody landed earns ARRIVED alone (1)',
    earned.length === 1 && earned[0]!.slot === 0 && earned[0]!.arrived === 1 && earned[0]!.landed === 0 && bankOf(store.getState().run.skills) === 1,
    JSON.stringify(earned));
  openDesk(store, null);
  const grants = store.getState().run.skills.grants;
  check('…the run\'s first desk tops the bank up to the floor: +2 (`FIRST SKILL ON THE HOUSE`), 3 to spend',
    grants.length === 1 && grants[0]!.source === 'first-pick' && grants[0]!.cycles === FIRST_PICK_FLOOR_CYCLES - 1 && grants[0]!.visit === 1
      && bankOf(store.getState().run.skills) === FIRST_PICK_FLOOR_CYCLES && TRAINING_TEXT.onTheHouse(grants[0]!.cycles) === '+2 CYCLES · FIRST SKILL ON THE HOUSE :)',
    JSON.stringify(grants));
  check('…and SET COURSE waits for the first pick (setCourse throws), the desk opened on TRAINING', deskBlocker(store.getState()) === 'first-pick'
    && store.getState().ui.deskWindow === 'training' && throws(() => setCourse(store, 2)) && store.getState().run.phase === 'desk');
}
{
  // A good ship 1 (4 of 5 steps) clears the floor by itself: no grant.
  const store = armRun();
  endShip(store, 'locked');
  store.update((draft) => { draft.run.skills.earned[0]!.landed = 4; });
  openDesk(store, null);
  check('a good ship 1 (5 earned) gets no first-pick grant', store.getState().run.skills.grants.length === 0 && bankOf(store.getState().run.skills) === 5);
}
{
  // A run that already paid for a skill (a migrated save's phase-2 AUTOBURN, here a suite's free file) is not topped up, and
  // its first desk does not ask for a pick (the foundation review's note).
  const store = armRun();
  giveSkillFile(store, 'autoburn', 1);
  endShip(store, 'crashed');
  openDesk(store, null);
  check('a run already holding a paid skill: no top-up, no first pick asked, the desk opens on the card',
    store.getState().run.skills.grants.length === 0 && deskBlocker(store.getState()) === null && store.getState().ui.deskWindow === null);
}
{
  const classic = createStore<GameState>(createInitialState({ seed: 7 }));
  classic.update((draft) => { draft.run.phase = 'report'; });
  endShip(classic, 'locked');
  openDesk(classic, null);
  check('the classic world earns too (one earning per ship), but its desk has no tree: no grant, no blocker',
    classic.getState().run.skills.earned.length === 1 && classic.getState().run.skills.grants.length === 0 && deskBlocker(classic.getState()) === null);
  check('…grantCycles refuses a non-positive or fractional grant', throws(() => grantCycles(classic, 0, 'story', null)) && throws(() => grantCycles(classic, 1.5, 'story', null)));
}

// --- The +2 CYCLES card -----------------------------------------------------------------------------------------------------
{
  const card = getUpgrade('cycles');
  check('+2 CYCLES is a salvage card that stacks, adds no file, and reads `+2 CYCLES`',
    card.salvage && card.maxOwned === Infinity && card.blocks === 0 && card.form === 'cycles' && card.title === `+${CYCLES_CARD_CYCLES} CYCLES`);
  const store = armRun();
  toDesk(store);
  pickFirstSkill(store);
  const state = store.getState();
  const final = state.run.map.arm.findIndex((ship, slot) => ship !== undefined && shipSummaryAt(state.run.map, slot).final);
  const ids = (ctx: ReturnType<typeof draftContext>): string => draftEntries(ctx).map((entry) => entry.def.id).join();
  const toTwo = draftContext(state, 200, { room: 152, chargeFloor: 12, to: 2 });
  const toFinal = draftContext(state, 200, { room: 152, chargeFloor: 12, to: final });
  check('…on the arm it can be dealt into a ship with a desk after it, never into a final ship (no desk follows)',
    toTwo.tree === true && !toTwo.toFinal && ids(toTwo).includes('cycles') && toFinal.toFinal === true && !ids(toFinal).includes('cycles'),
    `${ids(toTwo)} | ${ids(toFinal)}`);
  const classic = createStore<GameState>(createInitialState({ seed: 7 }));
  const classicCtx = draftContext(classic.getState(), 200);
  check('…never on the classic world (no tree): filtered before the draws, so its deals are unchanged',
    classicCtx.tree === false && !ids(classicCtx).includes('cycles') && ids(classicCtx) === ids((({ tree: _tree, toFinal: _toFinal, ...rest }) => rest)(classicCtx)));

  // Picked: a grant at TRANSMIT ▸ (the next desk's bank), never a card the unit carries.
  setCourseFromDesk(store, 2);
  store.update((draft) => { draft.run.transit!.offer = [{ id: 'cycles', title: card.title, effect: card.effect, why: 'test', boosted: false }]; });
  check('…picked on the PACKET', pickCard(store, 'cycles') === null && store.getState().run.transit!.pick === 'cycles');
  const before = bankOf(store.getState().run.skills);
  transmitNext(store);
  const after = store.getState().run;
  const grant = after.skills.grants.find((entry) => entry.source === 'salvage');
  check('…TRANSMIT ▸ turns it into a salvage grant (+2 at this visit), not a carried card; the first pick is bought',
    grant?.cycles === CYCLES_CARD_CYCLES && grant.visit === 1 && bankOf(after.skills) === before + CYCLES_CARD_CYCLES && !after.upgrades.includes('cycles')
      && after.skills.pending.length === 0 && after.skills.bought.length === 1, JSON.stringify(after.skills.grants));
}

// --- RUN END: UNSPENT and the tally ---------------------------------------------------------------------------------------
{
  const store = armRun();
  toDesk(store);
  pickFirstSkill(store);
  store.update((draft) => {
    // The pick bought, then v2 + LOCK 270 on a later desk, the file still at v1 (the rest lost: trained all the same).
    draft.run.skills.earned[0]!.landed = 5;
    draft.run.skills.bought.push(...draft.run.skills.pending);
    draft.run.skills.grants.push({ source: 'story', cycles: 3, visit: 1, label: null });
    draft.run.skills.bought.push({ skill: 'autoburn', kind: 'train', to: { version: 2, lock: 0 }, cost: 5, visit: 2 });
    draft.run.skills.bought.push({ skill: 'autoburn', kind: 'lock', to: { version: 2, lock: 1 }, cost: 1, visit: 2 });
    draft.run.skills.pending = [];
  });
  check('trainedCycles counts every level paid for at its price (v1 3 + v2 5 + LOCK 270 1 = 9), lost or not', trainedCycles(store.getState().run.skills) === 9);
  const bank = bankOf(store.getState().run.skills);
  store.update((draft) => { draft.run.phase = 'end'; draft.run.endCause = 'stayed'; });
  const model = runEndModel(store.getState());
  check('RUN END: `UNSPENT n` and the tally\'s `TRAINED 9 of 54 · UNSPENT n`', model.skills !== null && model.skills.trained === 9
    && model.skills.total === 54 && model.skills.unspent === bank && model.skills.unspentLine === `UNSPENT ${bank}`
    && model.skills.tallyLine === `TRAINED 9 of 54 · UNSPENT ${bank}`, JSON.stringify(model.skills));
  const classic = createStore<GameState>(createInitialState({ seed: 7 }));
  classic.update((draft) => { draft.run.phase = 'end'; draft.run.endCause = 'stayed'; });
  check('…the classic world has no tree line', runEndModel(classic.getState()).skills === null);
}

// --- The archive (03 §3.11) -----------------------------------------------------------------------------------------------
{
  const storage = stubStorage();
  const store: Store<GameState> = createStore<GameState>(createInitialState({ seed: 3, map: createRunMap({ wave: 1 }, 3), lineage: FIRST_RUN_LINEAGE }));
  pageOpen(store, storage, 3);
  receiveToReport(store);
  giveSkillFile(store, 'autoburn', 2, 1);
  store.update((draft) => { draft.run.stats.demos = [{ offsetTac: 2 }, { offsetTac: 4 }]; });
  const records = skillRecords(store.getState());
  check('skillRecords: each skill with a file, at its file\'s level, with AUTOBURN\'s accuracy (0.5 × mean 3 → 1.5 tac s late: 88%)',
    records.length === 1 && records[0]!.skill === 'autoburn' && records[0]!.version === 2 && records[0]!.lock === 1 && records[0]!.accuracy === 88,
    JSON.stringify(records));
  endShip(store, 'crashed');
  endRun(store, 'stayed');
  const lastUnit = parseLastUnit((storedMeta(storage) as { lastUnit: unknown }).lastUnit);
  check('RUN END writes them to the archive\'s last unit, and they read back through the parser',
    JSON.stringify(lastUnit?.skills) === JSON.stringify(records) && !storage.data.has(RUN_SAVE_KEY), JSON.stringify(lastUnit?.skills));
  const untrained = armRun();
  giveSkillFile(untrained, 'autoburn', 1);
  check('…a skill with no demos yet records no accuracy (UNTRAINED)', skillRecords(untrained.getState())[0]?.accuracy === null);
}

finish();
