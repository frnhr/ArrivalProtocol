// Slice 4 Track TREE (plan §6): TRAINING at the desk, from the buy to the boot, store level, about a second. Run 1's worked
// route walked desk to desk with no flights, on a page with stubbed storage (tests/unit/save/save-fixture.ts), so every
// save point is the game's own write.
// • The desk's required first pick: setCourse throws until it is made; the pick is real (trainCell), and the BEAM save it
//   rides in holds it bought, nothing pending.
// • trainCell's refusals (closed, unaffordable, needs-lower, owned, not-desk; the classic world has no tree); UNDO only the
//   last purchase of a skill, only at the desk, the bank given back; ◀ CHART keeps them; TRANSMIT ▸ commits them.
// • A reload at the desk restores SHIP DONE's bank with nothing pending (03 §5 item 4).
// • The boot's skill lines (03 §4): `> SKILL TRAINED: AUTOBURN.skl v1 · from your 1 capture · ACCURACY 92%`, the UNTRAINED
//   variant, `> SKILL RETRAINED` after new demos, none without; saying one records `announced` and fires 'skill-trained'
//   (the ONLINE stamp); bootLinePlan places it; a BEAM save resumed plans the same line.
// • The 'after-seeds' latch: a branch due by the map at openDesk is latched into RunSkillState.opened (SENTRY built for
//   this check only; 4a builds AUTOBURN alone).
// • Graded damage's watcher (03 §3.5): 'skill-version' on a step down and back up while flying, silent on a ship's first
//   tick and at the desk, and a file under REPAIR (offline) reads OFF.
import { check, finish } from '../landing/checks';
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { SkillId } from '@/types/skill';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import { createRunMap } from '@systems/map-run';
import { setCourse, backToChart, transmitNext, openDesk, endShip } from '@systems/run';
import { pickCard } from '@systems/draft';
import { trainCell, undoPurchase, restoreSkill, FIRST_PICK_ENFORCED } from '@systems/training';
import { bankOf, deskBlocker, visitNow, grantCycles, openBranchesAt } from '@systems/skill-tree';
import { skillBootLines, applySkillBootLine, mountSkillWatch } from '@systems/skill-files';
import { skillFilesOf } from '@state/selectors';
import { bootLinePlan } from '@data/script';
import { on } from '@systems/events';
import { advance } from '@systems/clock';
import { resumeRun } from '@systems/run-save';
import { SKILL_TREE } from '@data/skills';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { stubStorage, pageOpen, storedSave, receiveToReport, toDesk } from '../save/save-fixture';
import { giveSkillFile } from '../support/skills';

const throws = (run: () => unknown): boolean => { try { run(); return false; } catch { return true; } };
const v = (version: 1 | 2 | 3) => ({ kind: 'version' as const, version });
const lock = (level: 1 | 2) => ({ kind: 'lock' as const, level });

function sendNow(store: Store<GameState>): void {
  const offer = store.getState().run.transit!.offer;
  if (offer.length > 0) pickCard(store, offer.some((card) => card.id === 'charge') ? 'charge' : offer[0]!.id);
  transmitNext(store);
}

const storage = stubStorage();
const store = createStore<GameState>(createInitialState({ seed: 3, map: createRunMap({ wave: 1 }, 3), lineage: FIRST_RUN_LINEAGE }));
pageOpen(store, storage, 3);
receiveToReport(store);
store.update((draft) => { draft.run.stats.demos = [{ offsetTac: 2 }]; });
toDesk(store);

// --- Desk 1: the required pick ---------------------------------------------------------------------------------------------
check('the first pick is enforced (FIRST_PICK_ENFORCED): SET COURSE throws until it is made', FIRST_PICK_ENFORCED
  && deskBlocker(store.getState()) === 'first-pick' && throws(() => setCourse(store, 2)) && store.getState().run.phase === 'desk');
check('…visit 1 opens AUTOBURN v1 alone: v2 and LOCK RANGE are closed, the other branches too',
  trainCell(store, 'autoburn', v(2)) === 'closed' && trainCell(store, 'autoburn', lock(1)) === 'closed' && trainCell(store, 'sentry', v(1)) === 'closed');
check('…the pick (3 of the floor\'s 3) is pending, the bank 0, and the desk free', trainCell(store, 'autoburn', v(1)) === null
  && store.getState().run.skills.pending.length === 1 && bankOf(store.getState().run.skills) === 0 && deskBlocker(store.getState()) === null);
check('…buying it twice is refused (owned)', trainCell(store, 'autoburn', v(1)) === 'owned');
// A reload here (the page closed at the desk), played at the end (a page open takes the archive's session): SHIP DONE.
const atShipDone = Object.fromEntries(storage.data);
{
  const shipDone = storedSave(storage);
  check('SHIP DONE was written before the pick: its run has nothing pending and the floor\'s 3', shipDone.save.point === 'ship-done'
    && shipDone.save.payload.run.skills.pending.length === 0 && bankOf(shipDone.save.payload.run.skills) === 3);
}
setCourse(store, 2);
check('at the PACKET: no training (not-desk), UNDO throws, RESTORE refused', trainCell(store, 'autoburn', lock(1)) === 'not-desk'
  && throws(() => undoPurchase(store, 0)) && restoreSkill(store, 'autoburn') === 'not-desk');
backToChart(store);
check('◀ CHART: the purchase is still pending', store.getState().run.skills.pending.length === 1);
setCourse(store, 2);
sendNow(store);
{
  const beam = storedSave(storage);
  const run = beam.save.payload.run;
  check('TRANSMIT ▸ commits it before the ship starts: the BEAM save holds it bought, nothing pending, the arrival names it',
    beam.save.point === 'beam' && run.skills.pending.length === 0 && run.skills.bought.length === 1 && run.skills.bought[0]!.cost === 3
      && run.arrival?.skills[0]?.kind === 'trained' && run.arrival.skills[0].level.version === 1);
}

// --- The boot's line ----------------------------------------------------------------------------------------------------
let atBeam: { storage: Record<string, string>; lines: string } | null = null;
const trained: { skill: SkillId; kind: string; demos: number; accuracy: number | null }[] = [];
const offTrained = on('skill-trained', (payload) => { trained.push({ skill: payload.skill, kind: payload.kind, demos: payload.demos, accuracy: payload.accuracy }); });
{
  const lines = skillBootLines(store.getState());
  check('HALCYON\'s boot types `> SKILL TRAINED: AUTOBURN.skl v1 · from your 1 capture · ACCURACY 92%`', lines.length === 1
    && lines[0]!.kind === 'trained' && lines[0]!.text === '> SKILL TRAINED: AUTOBURN.skl v1 · from your 1 capture · ACCURACY 92%', JSON.stringify(lines));
  check('…bootLinePlan gives it its line, after the charge', bootLinePlan(store.getState(), lines.length).filter((kind) => kind === 'skill').length === 1);
  atBeam = { storage: Object.fromEntries(storage.data), lines: JSON.stringify(lines) };
  applySkillBootLine(store, lines[0]!);
  check('…saying it records the demos it named (announced 1) and fires \'skill-trained\' (the ONLINE stamp)',
    store.getState().run.skills.announced.autoburn === 1 && trained.length === 1 && trained[0]!.kind === 'trained' && trained[0]!.accuracy === 92);
}

// --- Desk 2: buy, refuse, UNDO ----------------------------------------------------------------------------------------------
toDesk(store);
{
  const bank = bankOf(store.getState().run.skills);
  check('desk 2 (bank 1): v2 is unaffordable, LOCK 810 needs 270 first, v3 is not built',
    bank === 1 && trainCell(store, 'autoburn', v(2)) === 'unaffordable' && trainCell(store, 'autoburn', lock(2)) === 'needs-lower'
      && trainCell(store, 'autoburn', v(3)) === 'closed', String(bank));
  grantCycles(store, 6, 'story', null);
  check('…with 7: v2 then LOCK 270 bought (5 + 1), the bank 1', trainCell(store, 'autoburn', v(2)) === null
    && trainCell(store, 'autoburn', lock(1)) === null && bankOf(store.getState().run.skills) === 1
    && store.getState().run.skills.pending.map((p) => `${p.kind}:${p.to.version}.${p.to.lock}`).join() === 'train:2.0,lock:2.1');
  check('…UNDO of v2 first throws (LOCK 270 rides on it), and an index out of range throws', throws(() => undoPurchase(store, 0)) && throws(() => undoPurchase(store, 5)));
  undoPurchase(store, 1);
  undoPurchase(store, 0);
  check('…UNDO in order gives the 6 back, nothing pending', bankOf(store.getState().run.skills) === 7 && store.getState().run.skills.pending.length === 0);
  check('…RESTORE with nothing lost is refused (owned)', restoreSkill(store, 'autoburn') === 'owned');
  trainCell(store, 'autoburn', v(2));
}
setCourse(store, 5);
sendNow(store);
{
  // KESTREL: the upgrade's line, then no line for a carried file with no new demos, a RETRAINED one with them.
  const lines = skillBootLines(store.getState());
  check('KESTREL\'s boot: `> SKILL TRAINED: AUTOBURN.skl v2 …`', lines.length === 1 && lines[0]!.text.startsWith('> SKILL TRAINED: AUTOBURN.skl v2 · from your 1 capture'));
  applySkillBootLine(store, lines[0]!);
}
toDesk(store);
setCourse(store, 11);
sendNow(store);
check('VESPER (carried, no new demos): no skill line', skillBootLines(store.getState()).length === 0);
toDesk(store);
store.update((draft) => { draft.run.stats.demos.push({ offsetTac: -1 }, { offsetTac: 0 }); });
setCourse(store, 15);
sendNow(store);
{
  const lines = skillBootLines(store.getState());
  check('…two more captures since: `> SKILL RETRAINED: AUTOBURN.skl v2 · 3 captures · ACCURACY …`', lines.length === 1 && lines[0]!.kind === 'retrained'
    && /^> SKILL RETRAINED: AUTOBURN\.skl v2 · 3 captures · ACCURACY \d+%$/.test(lines[0]!.text), lines[0]?.text);
}
offTrained();

// --- UNTRAINED, the classic world -----------------------------------------------------------------------------------------
{
  const fresh = createStore<GameState>(createInitialState({ seed: 4, map: createRunMap({ wave: 1 }, 4), lineage: FIRST_RUN_LINEAGE }));
  fresh.update((draft) => { draft.run.phase = 'report'; });
  toDesk(fresh);
  trainCell(fresh, 'autoburn', v(1));
  setCourse(fresh, 2);
  sendNow(fresh);
  check('no capture yet: `> SKILL TRAINED: AUTOBURN.skl v1 · UNTRAINED 40%`', skillBootLines(fresh.getState())[0]?.text === '> SKILL TRAINED: AUTOBURN.skl v1 · UNTRAINED 40%');
  const classic = createStore<GameState>(createInitialState({ seed: 7 }));
  classic.update((draft) => { draft.run.phase = 'report'; });
  toDesk(classic);
  giveSkillFile(classic, 'autoburn', 1);
  check('the classic world has no tree: trainCell and RESTORE refuse (closed), and a given file is never announced',
    trainCell(classic, 'autoburn', lock(1)) === 'closed' && restoreSkill(classic, 'autoburn') === 'closed'
      && openBranchesAt(classic.getState(), visitNow(classic.getState().run)).length === 0);
}

// --- The 'after-seeds' latch ----------------------------------------------------------------------------------------------
{
  const sentry = SKILL_TREE.sentry as { built: number };
  const built = sentry.built;
  sentry.built = 3;
  try {
    const run = createStore<GameState>(createInitialState({ seed: 3, map: createRunMap({ wave: 1 }, 3), lineage: FIRST_RUN_LINEAGE }));
    run.update((draft) => { draft.run.phase = 'report'; });
    for (const slot of [2, 5]) {
      toDesk(run);
      if (visitNow(run.getState().run) === 1) trainCell(run, 'autoburn', v(1));
      setCourse(run, slot);
      sendNow(run);
    }
    run.update((draft) => { draft.run.threat.trace = 1; draft.run.phase = 'report'; });
    endShip(run, 'locked');
    openDesk(run, null);
    const opened = run.getState().run.skills.opened;
    check('visit 3 after seeds (SENTRY built for this check): openDesk latches DEFENCE open, once',
      opened.length === 1 && opened[0]!.skill === 'sentry' && opened[0]!.visit === 3 && openBranchesAt(run.getState(), 3).includes('sentry')
        && trainCell(run, 'sentry', v(1)) !== 'closed', JSON.stringify(opened));
  } finally {
    sentry.built = built;
  }
}

// --- Graded damage's watcher ----------------------------------------------------------------------------------------------
{
  const flight = createStore<GameState>(createInitialState({ seed: 5, map: createRunMap({ wave: 1 }, 5), lineage: FIRST_RUN_LINEAGE }));
  giveSkillFile(flight, 'autoburn', 2);
  flight.update((draft) => { draft.run.phase = 'flight'; draft.clock.paused = true; });
  const steps: string[] = [];
  const off = on('skill-version', ({ skill, from, to }) => { steps.push(`${skill}:${from}>${to}`); });
  const unmount = mountSkillWatch(flight);
  const setHealth = (integrity: number, state?: 'repairing'): void => {
    flight.update((draft) => {
      const seg = skillFilesOf(draft.memory, 'autoburn')[0]!;
      seg.integrity = integrity;
      seg.state = state ?? 'intact';
    });
    advance(flight, 0.05);
  };
  advance(flight, 0.05);
  check('the watcher is silent on a ship\'s first tick', steps.length === 0);
  setHealth(64);
  setHealth(64);
  setHealth(30);
  setHealth(90);
  check('…a bite to 64% steps v2 → v1, to 30% v1 → off, a REPAIR to 90% off → v2 (each once)', steps.join(' ') === 'autoburn:2>1 autoburn:1>0 autoburn:0>2', steps.join(' '));
  steps.length = 0;
  setHealth(90, 'repairing');
  check('…a file under REPAIR is offline: OFF', steps.join(' ') === 'autoburn:2>0', steps.join(' '));
  flight.update((draft) => { draft.run.phase = 'desk'; });
  steps.length = 0;
  setHealth(30);
  check('…at the desk it follows silently', steps.length === 0);
  unmount();
  off();
}

// --- Reloads (each a page open on a copy of the storage as it was) -------------------------------------------------------
{
  const reload = createStore<GameState>(createInitialState({ seed: 3 }));
  pageOpen(reload, stubStorage(atShipDone), 3);
  resumeRun(reload);
  check('a reload at desk 1: the desk again, SHIP DONE\'s bank 3, nothing pending, the pick asked for, on TRAINING',
    reload.getState().run.phase === 'desk' && bankOf(reload.getState().run.skills) === 3 && reload.getState().run.skills.pending.length === 0
      && deskBlocker(reload.getState()) === 'first-pick' && reload.getState().ui.deskWindow === 'training');
  pageOpen(reload, stubStorage(atBeam!.storage), 3);
  resumeRun(reload);
  check('a reload in HALCYON\'s boot replays the BEAM: the same skill line planned, the file in memory',
    reload.getState().run.phase === 'boot' && JSON.stringify(skillBootLines(reload.getState())) === atBeam!.lines
      && skillFilesOf(reload.getState().memory, 'autoburn').length === 1);
}

finish();
