// Playtest 1 B-ORDER (docs/phase3/impl/playtest-1-plan.md §3.3; Fran's notes 5 and 20), store level, no flights:
// • the new order: a ship's end opens LEAVE ORBIT (phase 'leave', both clocks stopped), the salvage dealt with no hop
//   (seeded by the slot left: dealDraft deals the same three again; a file card fits the largest room in reach), ENTER
//   wants a pick, takes it and opens the desk; the pick is held (not applied) through the desk and ◀ CHART, rides the
//   PACKET's plan and the beam, and is cleared at the next boot; the final ship has no LEAVE ORBIT;
// • the screen's words: LEAVE ORBIT after a landing, LEAVING <SHIP> and the toll after a lost ship;
// • the PACKET only when it asks (transmit.ts packetAsks): none on a plain hop (SET COURSE beams at once), and each of its
//   four questions where they arise (files over the room, the zero-charge confirm, a delivery, PACK AS under a squeeze);
// • the save points: SHIP DONE at LEAVE ORBIT (no pick, stage leave-orbit / leaving) and again at the desk (the pick held,
//   stage desk), RESUME at each, the codec's refusals of a pick at LEAVE ORBIT, a pick not dealt, and a wrong stage;
// • v9 → v10: the three v9 fixtures (dumped before the change) migrate: no hop keeps linkBlocks, run.leave is empty, the
//   resume stage follows the phase; they decode and RESUME (a v9 desk with no pick, its beam crossing with none).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import {
  continueAfterReport, continueAfterLoss, leaveOrbit, setCourse, backToChart, transmitNext, endShip, openLeaveOrbit,
} from '@systems/run';
import { dealDraft, draftContext, leaveRoom, pickCard } from '@systems/draft';
import { leaveModel } from '@systems/leave-orbit';
import { packetAsks, transmitModel } from '@systems/transmit';
import { decodeRunSave, migrateRunSave } from '@systems/save-codec';
import { resumeRun } from '@systems/run-save';
import { reachableFrom, hopBetween } from '@systems/map-hop';
import { currentSlot } from '@systems/map-streams';
import { setPackAs } from '@systems/training';
import { pickFirstSkill, giveSkillFile } from '../support/skills';
import { setCourseFromDesk, leaveOrbit as takeSalvage } from '../support/desk';
import { armRun, toLeave, toDesk, send, addRequest } from './repo-fixture';
import { stubStorage, pageOpen, storedSave, receiveToReport, WORKED_ROUTE } from '../save/save-fixture';
import { LEAVE_TEXT } from '@data/leave-text';
import { TRANSMIT_TEXT } from '@data/script';
import { RUN_SAVE_KEY, META_STORAGE_KEY, RUN_SAVE_VERSION } from '@data/tuning';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const throws = (fn: () => void): boolean => { try { fn(); return false; } catch { return true; } };

// --- The new order ----------------------------------------------------------------------------------------------------------
{
  const store = armRun(5);
  store.update((draft) => { draft.burn.status = 'locked'; });
  continueAfterReport(store);
  const state = store.getState();
  check('a LANDING REPORT\'s CONTINUE opens LEAVE ORBIT: phase leave, both clocks stopped, three cards, nothing taken',
    state.run.phase === 'leave' && state.clock.paused && state.run.leave.offer.length === 3 && state.run.leave.pick === null, state.run.phase);
  check('…the deal needs no hop and is seeded by the ship left: dealt again from the same state, the same three',
    JSON.stringify(dealDraft(state)) === JSON.stringify(state.run.leave.offer), state.run.leave.offer.map((card) => card.id).join());
  const from = currentSlot(state.run);
  const best = Math.max(...reachableFrom(state.run.map, from).map((to) => { const hop = hopBetween(state.run.map, from, to); return hop.room - hop.chargeFloor; }));
  const room = leaveRoom(state);
  check('…a file card must fit the largest room in reach (less its floor and the files)', room !== undefined && room.room - room.chargeFloor === best
    && draftContext(state, room).fileRoom === Math.max(0, best - filesOf(state)), JSON.stringify(room));
  const model = leaveModel(state);
  check('…the screen: LEAVE ORBIT after a landing, SALVAGE · TAKE ONE WITH YOU, keys [1] [2] [3], TAKE ONE FIRST until a pick',
    model.title === LEAVE_TEXT.title && !model.lost && model.why === null && model.heading === 'SALVAGE · TAKE ONE WITH YOU'
    && model.keys === 'click one, or press [1] [2] [3]' && model.waiting && model.go === LEAVE_TEXT.goWaiting, JSON.stringify(model));
  check('…no desk and no PACKET before ENTER', throws(() => setCourse(store, reachableFrom(state.run.map, from)[0]!)) && throws(() => leaveOrbit(store)));
  const id = state.run.leave.offer[1]!.id;
  check('…a pick ([2]) is held, and can change', pickCard(store, state.run.leave.offer[0]!.id) === null && pickCard(store, id) === null
    && store.getState().run.leave.pick === id && leaveModel(store.getState()).go === LEAVE_TEXT.go);
  leaveOrbit(store);
  check('…ENTER opens the desk with the pick held', store.getState().run.phase === 'desk' && store.getState().run.leave.pick === id
    && pickCard(store, id) === 'not-leaving');
  pickFirstSkill(store);
  setCourse(store, WORKED_ROUTE[1]!);
  check('…SET COURSE: the PACKET\'s plan carries the pick', store.getState().run.transit?.pick === id);
  backToChart(store);
  check('…◀ CHART keeps it (it is LEAVE ORBIT\'s, not the plan\'s)', store.getState().run.leave.pick === id && store.getState().run.transit === null);
  setCourse(store, WORKED_ROUTE[1]!);
  transmitNext(store);
  check('…the beam crosses with it, and the next ship starts with no salvage', store.getState().run.phase === 'boot'
    && store.getState().run.leave.offer.length === 0 && store.getState().run.leave.pick === null
    && (id === 'cycles' || id === 'skill' || store.getState().run.upgrades.includes(id)), id);
}
// The unit's files as the deal counts them: draftContext's fileRoom is room − floor − files, read back from a huge room.
function filesOf(state: Readonly<GameState>): number {
  const huge = { room: 10_000, chargeFloor: 0 };
  return 10_000 - draftContext(state, huge).fileRoom;
}
{
  // A lost ship: LEAVING <SHIP>, its way out said; the final ship has no LEAVE ORBIT.
  const store = createStore<GameState>(createInitialState({ seed: 4, shipIndex: 1, carried: 'fresh' }));
  store.update((draft) => { draft.run.phase = 'flight'; draft.burn.status = 'crashed'; });
  continueAfterLoss(store);
  const model = leaveModel(store.getState());
  check('a lost ship: `LEAVING HALCYON`, the emergency\'s toll on the why line, in the warning colour',
    store.getState().run.phase === 'leave' && model.title === 'LEAVING HALCYON' && model.lost && model.emergency
    && model.why !== null && model.why.startsWith('EMERGENCY TRANSMIT'), model.why ?? '');
  const final = createStore<GameState>(createInitialState({ seed: 4, shipIndex: 4, carried: 'fresh' }));
  final.update((draft) => { draft.run.phase = 'report'; });
  endShip(final, 'locked');
  check('the final ship has no LEAVE ORBIT', throws(() => openLeaveOrbit(final, null)));
}

// --- The PACKET only when it asks -------------------------------------------------------------------------------------------
{
  const store = armRun(3);
  toDesk(store);
  setCourseFromDesk(store, 2);
  check('a plain hop (ARES-VII → HALCYON, everything fits, no delivery): the PACKET asks nothing, so SET COURSE beams at once',
    packetAsks(store.getState()).length === 0 && transmitModel(store.getState()).asks.length === 0);
  // Files over the room: the room shrunk for the check (the plan's hop is the destination's room).
  store.update((draft) => { draft.run.transit!.hop.room = 40; });
  check('…files over the room: `leave-files`', packetAsks(store.getState()).includes('leave-files'), packetAsks(store.getState()).join());
}
{
  // A delivery riding the hop: SEND ON is a question.
  const store = armRun(3);
  send(store, 2);
  toDesk(store);
  addRequest(store, { file: 'mv', status: 'in-transit', lateness: hopBetween(store.getState().run.map, 2, 5).slackYears - 1 });
  setCourseFromDesk(store, 5);
  check('a delivery rides the hop: `deliveries`', packetAsks(store.getState()).includes('deliveries'), packetAsks(store.getState()).join());
}
{
  // KESTREL → LAPWING (TIGHT, no floor): no charge held, so none arrives: the zero-charge confirm is a question.
  const store = armRun(3);
  send(store, 2);
  send(store, 5);
  toDesk(store);
  store.update((draft) => { const pool = draft.memory.find((seg) => seg.type === 'redundancy'); if (pool?.type === 'redundancy') pool.used = 0; });
  setCourseFromDesk(store, 8);
  check('…a TIGHT ship that takes no charge: `zero-charge`', packetAsks(store.getState()).includes('zero-charge'), packetAsks(store.getState()).join());
}
{
  // A squeezed room with a skill that could cross lower: PACK AS is a question; packed, the squeeze is still there.
  const store = armRun(3);
  send(store, 2);
  toDesk(store);
  giveSkillFile(store, 'autoburn', 2);
  setCourseFromDesk(store, 5);
  const fit = transmitModel(store.getState()).room.fit;
  store.update((draft) => { draft.run.transit!.hop.room = fit.files + fit.wanted - 4; });
  const packable = transmitModel(store.getState()).chips.some((chip) => (chip.skill?.packAs.length ?? 0) > 0);
  check('…a squeezed room with a skill that can cross lower (AUTOBURN v2 aboard): `pack-as`',
    packable && packetAsks(store.getState()).includes('pack-as'), packetAsks(store.getState()).join());
  store.update((draft) => { draft.run.transit!.hop.room = fit.files + fit.wanted + 20; });
  check('…the same skill with room to spare: no question', !packetAsks(store.getState()).includes('pack-as'), packetAsks(store.getState()).join());
  store.update((draft) => { draft.run.transit!.hop.room = fit.files + fit.wanted - 4; });
  if (packable) {
    const chip = transmitModel(store.getState()).chips.find((candidate) => (candidate.skill?.packAs.length ?? 0) > 0)!;
    setPackAs(store, chip.segId, chip.skill!.packAs[0]!.level);
    check('…PACK AS chosen: still a question while the room squeezes (the kid may change it)', transmitModel(store.getState()).room.fit.roomLost === 0
      || packetAsks(store.getState()).includes('pack-as'));
  }
  // The charge card's room note rides the PACKET (and the SHIP CARD): TRANSMIT_TEXT.cardFits.
  check('…the card note is the PACKET\'s words for the taken +12 card', TRANSMIT_TEXT.cardFits(12, 4, 'KESTREL') === '+12 · ONLY 4 FIT ON KESTREL');
}

// --- The save points ----------------------------------------------------------------------------------------------------------
{
  const SEED = 7;
  const storage = stubStorage();
  const store = createStore<GameState>(createInitialState({ seed: SEED }));
  pageOpen(store, storage, SEED);
  receiveToReport(store);
  toLeave(store);
  const atLeave = storedSave(storage).save;
  check('SHIP DONE at LEAVE ORBIT: phase leave, the deal, no pick, the resume line `… SHIP 1 DONE · LEAVING ORBIT …`',
    atLeave.point === 'ship-done' && atLeave.payload.kind === 'world' && atLeave.payload.phase === 'leave' && atLeave.payload.run.leave.offer.length === 3
    && atLeave.payload.run.leave.pick === null && atLeave.resume.stage === 'leave-orbit', JSON.stringify(atLeave.resume));
  const raw = storage.data.get(RUN_SAVE_KEY)!;
  const edit = (change: (save: Raw) => void): string => { const save = JSON.parse(raw) as Raw; change(save); return JSON.stringify(save); };
  const refusal = (text: string): string => { const decoded = decodeRunSave(text); return decoded.ok ? 'ok' : `${decoded.refusal.kind}: ${decoded.refusal.detail}`; };
  const picked = refusal(edit((save) => { save.payload.run.leave.pick = save.payload.run.leave.offer[0].id; }));
  const stage = refusal(edit((save) => { save.resume.stage = 'desk'; }));
  const phase = refusal(edit((save) => { save.payload.phase = 'desk'; }));
  const dup = refusal(edit((save) => { save.payload.run.leave.offer[1] = save.payload.run.leave.offer[0]; }));
  check('…the codec refuses a pick at LEAVE ORBIT\'s save, a wrong stage, a payload phase not the run\'s, a card dealt twice',
    picked.startsWith('shape') && stage.startsWith('shape') && phase.startsWith('shape') && dup.startsWith('shape'), [picked, stage, phase, dup].join(' | '));
  pageOpen(store, storage, SEED + 100);
  resumeRun(store);
  check('…RESUME at LEAVE ORBIT: the same three cards, nothing taken', store.getState().run.phase === 'leave'
    && JSON.stringify(store.getState().run.leave.offer) === JSON.stringify(atLeave.payload.run.leave.offer) && store.getState().run.leave.pick === null);
  const id = takeSalvage(store);
  const atDesk = storedSave(storage).save;
  check('SHIP DONE again at the desk: the pick held, stage desk (`… AT THE DESK …`)', atDesk.payload.kind === 'world' && atDesk.payload.phase === 'desk'
    && atDesk.payload.run.leave.pick === id && atDesk.resume.stage === 'desk', String(id));
  const deskRaw = storage.data.get(RUN_SAVE_KEY)!;
  const notDealt = (() => { const save = JSON.parse(deskRaw) as Raw; save.payload.run.leave.pick = 'skill'; const d = decodeRunSave(JSON.stringify(save)); return d.ok ? 'ok' : d.refusal.kind; })();
  check('…the codec refuses a desk pick that was not dealt', notDealt === 'shape', notDealt);
  pageOpen(store, storage, SEED + 200);
  resumeRun(store);
  check('…RESUME at the desk: the pick held', store.getState().run.phase === 'desk' && store.getState().run.leave.pick === id);
  // A lost ship's LEAVE ORBIT: stage `leaving`.
  pickFirstSkill(store);
  setCourse(store, WORKED_ROUTE[1]!);
  transmitNext(store);
  store.update((draft) => { draft.run.phase = 'flight'; draft.burn.status = 'crashed'; });
  continueAfterLoss(store);
  check('a lost ship\'s SHIP DONE: stage `leaving` (`… LEAVING HALCYON …`)', storedSave(storage).save.resume.stage === 'leaving'
    && storedSave(storage).save.resume.ship === 'HALCYON', JSON.stringify(storedSave(storage).save.resume));
}

// --- v9 → v10: the fixtures dumped before the change ---------------------------------------------------------------------------
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'save', 'fixtures');
for (const [file, stage, phase] of [
  ['run-save-v9-ship-done-halcyon.json', 'desk', 'desk'], ['run-save-v9-beam-kestrel.json', 'boot', 'boot'], ['run-save-v9-ship-done-lost.json', 'desk', 'desk'],
] as const) {
  const fixture = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as { save: Raw; meta: Raw };
  const migrated = migrateRunSave(structuredClone(fixture.save)) as Raw;
  const hops = (migrated.payload.run.map.route as Raw[]).map((stop) => stop.hop).filter((hop) => hop !== null);
  check(`v9 ${file}: migrates to v${RUN_SAVE_VERSION}: no hop keeps linkBlocks, run.leave empty, the stage \`${stage}\``,
    migrated.saveVersion === RUN_SAVE_VERSION && hops.length > 0 && hops.every((hop) => !('linkBlocks' in hop))
    && JSON.stringify(migrated.payload.run.leave) === JSON.stringify({ offer: [], pick: null }) && migrated.resume.stage === stage,
    JSON.stringify(migrated.resume));
  const decoded = decodeRunSave(JSON.stringify(fixture.save));
  check(`…decodes`, decoded.ok, decoded.ok ? '' : `${decoded.refusal.kind}: ${decoded.refusal.detail}`);
  const storage = stubStorage({ [RUN_SAVE_KEY]: JSON.stringify(fixture.save), [META_STORAGE_KEY]: JSON.stringify(fixture.meta) });
  const store = createStore<GameState>(createInitialState({ seed: 1 }));
  pageOpen(store, storage, 1);
  resumeRun(store);
  check(`…and RESUMEs (${phase})`, store.getState().run.phase === phase && store.getState().save.status === 'ok', store.getState().run.phase);
  if (phase === 'desk') {
    const extra = fixture.save.payload.run.map.pendingExtra;
    const next = reachableFrom(store.getState().run.map, currentSlot(store.getState().run))[0]!;
    setCourseFromDesk(store, next);
    check('…a v9 desk resumes with no pick (its deal was not made in v9): the beam crosses with none, a lost ship\'s extras kept',
      store.getState().run.transit?.pick === null && JSON.stringify(store.getState().run.map.pendingExtra) === JSON.stringify(extra)
      && (extra === null || store.getState().run.transit?.extraHits === extra.extraHits));
    transmitNext(store);
    check('…and it crosses', store.getState().run.phase === 'boot');
  }
}

finish();
