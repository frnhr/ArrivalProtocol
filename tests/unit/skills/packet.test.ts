// Slice 4 Track TREE (plan §6): skill files in the packet, store level, about a second. Run 1's worked route walked desk to
// desk with no flights (tests/unit/map/repo-fixture.ts), every send the real one.
// • A purchase's file joins the packet through planPacket, the one adder (03 §3.3): the first pick's AUTOBURN v1 (6) on
//   the PACKET as a locked chip (`TRAINED HERE · ◀ CHART TO UNDO`), counted by the room and the preview alike;
//   it arrives fresh, after the AI tools (layoutCarried), and the arrival names it 'trained'.
// • An upgrade replaces the file with a fresh one at 100% (new code heals and cures), in the old one's place; the old one
//   has no chip.
// • PACK AS (4b, round-2 decision 10): the chip's line and RESTORE prices (`AUTOBURN.skl v2 (9) → brake by hand · RESTORE
//   4`, `PACK AS v1 (7) · RESTORE 2`: v2 costs 4 since slice 8); the copy crosses at the lower size with its id, integrity and infection kept; it is
//   refused on a file trained here and on a level that is not lower; leaving a packed file behind forgets it, packing a
//   left-behind file takes it back. ◀ CHART forgets PACK AS with the drops.
// • RESTORE at the next desk: v2 reads lost (`LOST · RESTORE 2`), the purchase brings v2 + LOCK 270 back fresh, and the
//   arrival names it 'restored'.
// • The unit room as the second limit (01 §3.16): a TIGHT room counts the skills, binds before the link, and PACK AS or a
//   drop is the way under it; skillRelief names the cheapest options first.
// • Skills are prey like any upgrade file: transit hits reach them with no 60 floor, and HOLLOW's rm takes them in its
//   second tier (decision 17's unlink).
import { check, finish } from '../landing/checks';
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { Segment, SkillFileSegment } from '@/types/segment';
import { setCourse, backToChart, transmitNext } from '@systems/run';
import { transitPacket, planPacket } from '@systems/draft';
import { transmitModel, toggleDrop, type PacketChip } from '@systems/transmit';
import { unitArrival } from '@systems/arrival-preview';
import { setPackAs, restoreSkill, trainCell } from '@systems/training';
import { skillPacketPlan, skillRelief, NO_SKILL_PLAN } from '@systems/skill-files';
import { treeCells, visitNow, grantCycles, bankOf } from '@systems/skill-tree';
import { skillFilesOf, isSkillFile } from '@state/selectors';
import { rollTransitHits, toolKindOf } from '@systems/carry';
import { rmTargets } from '@systems/hollow';
import { createRng } from '@systems/rng';
import { currentSlot } from '@systems/map-streams';
import { PACKET_SKILL_TEXT } from '@data/training-text';
import { armRun, toDesk } from '../map/repo-fixture';
import { pickFirstSkill } from '../support/skills';

const throws = (run: () => unknown): boolean => { try { run(); return false; } catch { return true; } };
const autoburn = (store: Store<GameState>): SkillFileSegment[] => skillFilesOf(store.getState().memory, 'autoburn');
// A file that crossed fresh: at 100% before any transit hit landed on it (the arrival's hits name it from 100).
const arrivedFresh = (store: Store<GameState>, file: Readonly<SkillFileSegment>): boolean => {
  const hits = store.getState().run.arrival!.hits.filter((hit) => hit.segId === file.id);
  return hits.length === 0 ? file.integrity === 100 : hits[0]!.from === 100 && hits.at(-1)!.to === file.integrity;
};
const chipOf = (store: Store<GameState>, pred: (chip: PacketChip) => boolean): PacketChip | undefined => transmitModel(store.getState()).chips.find(pred);

// The desk (the first pick made at visit 1), then SET COURSE to `slot`.
function toPacket(store: Store<GameState>, slot: number): void {
  toDesk(store);
  if (visitNow(store.getState().run) === 1 && store.getState().run.skills.pending.length === 0) pickFirstSkill(store);
  setCourse(store, slot);
}

// The PACKET's send (LEAVE ORBIT took the +12 card, no file joins, or the first card dealt: repo-fixture toDesk).
function sendNow(store: Store<GameState>): void {
  transmitNext(store);
}

const store = armRun();

// --- Desk 1: the first pick rides the packet ---------------------------------------------------------------------------------
toPacket(store, 2);
{
  const state = store.getState();
  const plan = state.run.transit!;
  const withSkill = transitPacket(state, plan);
  const without = planPacket(state.memory, { ...plan, skills: NO_SKILL_PLAN });
  check('the first pick\'s AUTOBURN v1 joins the packet through planPacket: +6 blocks, one fresh skill named',
    withSkill.filesBlocks === without.filesBlocks + 6 && withSkill.skills.length === 1 && withSkill.skills[0]!.how === 'fresh'
      && plan.filesBlocks === withSkill.filesBlocks, `${withSkill.filesBlocks} vs ${without.filesBlocks}`);
  const chip = chipOf(store, (candidate) => candidate.skill?.skill === 'autoburn');
  check('…its chip is locked (`TRAINED HERE · ◀ CHART TO UNDO`), not toggleable, v1 (6), no PACK AS',
    chip?.lock === 'trained' && chip.note === PACKET_SKILL_TEXT.trainedHere && !chip.toggleable && chip.blocks === 6 && chip.skill?.trained === true
      && chip.skill.packAs.length === 0, JSON.stringify(chip));
  check('…the room and the preview count it as the send will', transmitModel(state).room.fit.files === withSkill.filesBlocks
    && unitArrival(state, { hop: plan.hop, threat: plan.threat, dropped: [], pick: null, deliveries: plan.deliveries }).fit.files === withSkill.filesBlocks);
  check('…a click on it is refused: locked', toggleDrop(store, chip!.segId) === 'locked');
  backToChart(store);
  check('◀ CHART keeps the purchase pending (UNDO works until TRANSMIT ▸)', store.getState().run.skills.pending.length === 1 && store.getState().run.phase === 'desk');
  setCourse(store, 2);
}
sendNow(store);
{
  const state = store.getState();
  const files = autoburn(store);
  const segs = state.memory.filter((seg) => seg.type !== 'free');
  const lastTool = Math.max(...segs.map((seg, i) => (seg.type === 'tool' || seg.type === 'core' ? i : -1)));
  const at = segs.indexOf(files[0]!);
  check('it arrives at HALCYON: AUTOBURN.skl v1, 6 blocks, 100%, after every AI tool, named \'trained\' by the arrival',
    files.length === 1 && files[0]!.version === 1 && files[0]!.size === 6 && arrivedFresh(store, files[0]!) && at > lastTool
      && state.run.arrival!.skills.length === 1 && state.run.arrival!.skills[0]!.kind === 'trained' && state.run.arrival!.skills[0]!.segId === files[0]!.id
      && state.run.skills.pending.length === 0 && state.run.skills.bought.length === 1, `at ${at}, last tool ${lastTool}`);
}

// --- Desk 2: an upgrade heals and replaces -------------------------------------------------------------------------------
toDesk(store);
grantCycles(store, 6, 'story', null);
const oldId = autoburn(store)[0]!.id;
store.update((draft) => {
  const seg = draft.memory.find((candidate) => candidate.id === oldId)!;
  if (seg.type === 'upgrade') { seg.integrity = 40; seg.infected = { hollowId: 'h', sinceAiSec: 0 } as never; }
});
check('desk 2: v2 and LOCK 270 bought (5 + 1)', trainCell(store, 'autoburn', { kind: 'version', version: 2 }) === null
  && trainCell(store, 'autoburn', { kind: 'lock', level: 1 }) === null);
setCourse(store, 5);
{
  const chips = transmitModel(store.getState()).chips;
  check('…the PACKET shows the fresh v2 + LOCK 270 (9) locked, and no chip for the old v1 file',
    !chips.some((chip) => chip.segId === oldId) && chips.filter((chip) => chip.skill !== null).length === 1
      && chips.find((chip) => chip.skill !== null)!.blocks === 9 && chips.find((chip) => chip.skill !== null)!.lock === 'trained');
}
sendNow(store);
{
  const files = autoburn(store);
  check('…KESTREL: the old file is gone, the new one v2 + LOCK 270 at 100% and clean (new code heals and cures)',
    files.length === 1 && files[0]!.id !== oldId && files[0]!.version === 2 && files[0]!.lock === 1 && files[0]!.size === 9
      && arrivedFresh(store, files[0]!) && files[0]!.infected === undefined && store.getState().run.arrival!.skills[0]!.kind === 'trained',
    JSON.stringify(files));
}

// --- Desk 3: PACK AS ----------------------------------------------------------------------------------------------------
toDesk(store);
const fileId = autoburn(store)[0]!.id;
store.update((draft) => {
  const seg = draft.memory.find((candidate) => candidate.id === fileId)!;
  if (seg.type === 'upgrade') seg.integrity = 64;
});
setCourse(store, 11);
{
  const chip = chipOf(store, (candidate) => candidate.segId === fileId)!;
  check('the skill chip names its loss and RESTORE price: `AUTOBURN.skl v2 (9) → brake by hand · RESTORE 4`',
    chip.note === 'AUTOBURN.skl v2 (9) → brake by hand · RESTORE 4' && chip.skill?.restore === 4 && chip.lock === null, chip.note);
  check('…with `PACK AS v1 (7) · RESTORE 2` beside it (the lock kept)', chip.skill?.packAs.length === 1
    && chip.skill.packAs[0]!.text === 'PACK AS v1 (7) · RESTORE 2' && !chip.skill.packAs[0]!.active, JSON.stringify(chip.skill?.packAs));
  const order = transmitModel(store.getState()).chips.filter((candidate) => candidate.lock === null);
  check('…skills come last among the files that can stay behind', order.at(-1)?.segId === fileId, order.map((candidate) => candidate.name).join());
  check('…PACK AS at a level not below the file\'s throws', throws(() => setPackAs(store, fileId, { version: 2, lock: 1 }))
    && throws(() => setPackAs(store, fileId, { version: 1, lock: 2 })));
  const before = store.getState().run.transit!.filesBlocks;
  setPackAs(store, fileId, { version: 1, lock: 1 });
  const packed = chipOf(store, (candidate) => candidate.segId === fileId)!;
  check('…PACK AS v1: the chip crosses as v1 + LOCK 270 (7), its option active; the packet 2 blocks lighter',
    packed.blocks === 7 && packed.skill?.packedAs?.version === 1 && packed.skill.packAs[0]!.active
      && store.getState().run.transit!.filesBlocks === before - 2 && transmitModel(store.getState()).files === before - 2);
  // Playtest 1 (note 20): KESTREL → VESPER's link (86) squeezed the charge here, so a drop bought some; with no link, the
  // destination's room is squeezed instead (the plan's hop is its room: ◀ CHART below deals a fresh plan).
  const squeeze = transmitModel(store.getState()).room.fit;
  store.update((draft) => { draft.run.transit!.hop.room = squeeze.files + squeeze.wanted - 10; });
  toggleDrop(store, fileId);
  check('…leaving it behind forgets PACK AS', store.getState().run.transit!.dropped.includes(fileId) && Object.keys(store.getState().run.transit!.packAs).length === 0);
  setPackAs(store, fileId, { version: 1, lock: 1 });
  check('…packing a left-behind file takes it back at that level', !store.getState().run.transit!.dropped.includes(fileId)
    && store.getState().run.transit!.packAs[fileId]?.version === 1);
  backToChart(store);
  setCourse(store, 11);
  check('◀ CHART forgets PACK AS with the drops', Object.keys(store.getState().run.transit!.packAs).length === 0);
  setPackAs(store, fileId, { version: 1, lock: 1 });
}
sendNow(store);
{
  const files = autoburn(store);
  const hits = store.getState().run.arrival!.hits.filter((hit) => hit.segId === fileId);
  check('…it crosses as v1 + LOCK 270: the same id, 7 blocks, its health kept (64, less any transit hit), named \'packed\'',
    files.length === 1 && files[0]!.id === fileId && files[0]!.version === 1 && files[0]!.lock === 1 && files[0]!.size === 7
      && (hits.length === 0 ? files[0]!.integrity === 64 : hits[0]!.from === 64) && store.getState().run.arrival!.skills[0]!.kind === 'packed', JSON.stringify(files[0]));
}

// --- Desk 4: RESTORE ------------------------------------------------------------------------------------------------------
toDesk(store);
{
  const state = store.getState();
  const v2 = treeCells(state, visitNow(state.run)).find((cell) => cell.skill === 'autoburn' && cell.row.kind === 'version' && cell.row.version === 2)!;
  check('the next desk: v2 reads lost (RESTORE is the way back), and trainCell refuses it', v2.look === 'lost'
    && trainCell(store, 'autoburn', { kind: 'version', version: 2 }) === 'lost');
  grantCycles(store, 3, 'story', null);
  const bank = bankOf(store.getState().run.skills);
  check('…RESTORE costs half the lost v2, rounded up (2)', restoreSkill(store, 'autoburn') === null
    && bankOf(store.getState().run.skills) === bank - 2 && store.getState().run.skills.pending[0]!.to.version === 2);
  check('…a second RESTORE has nothing to bring back', restoreSkill(store, 'autoburn') === 'owned');
  setCourse(store, 15);
  check('…PACK AS on the file it replaces throws (trained here)', throws(() => setPackAs(store, fileId, { version: 1, lock: 0 })));
}
sendNow(store);
{
  const files = autoburn(store);
  check('…it arrives v2 + LOCK 270, fresh, named \'restored\'', files.length === 1 && files[0]!.version === 2 && files[0]!.lock === 1
    && arrivedFresh(store, files[0]!) && store.getState().run.arrival!.skills[0]!.kind === 'restored');
}

// --- The unit room as the limit (01 §3.16; playtest 1 note 20: the only one) -------------------------------------------
toDesk(store);
{
  const state = store.getState();
  const files = transitPacket(state, { dropped: [], pick: null, deliveries: [], packAs: {} }).filesBlocks;
  const hop = { to: currentSlot(state.run), room: files - 1, chargeFloor: 0 };
  const plan = { hop, threat: { act: 'calm' as const, beamSeeds: { kind: 'none' as const } }, dropped: [], pick: null, deliveries: [] };
  const fit = unitArrival(state, plan).fit;
  check('a TIGHT room one block short of the files: the room binds (the skills counted in the files)',
    fit.over === 1 && fit.word === 'leave', JSON.stringify(fit));
  const id = autoburn(store)[0]!.id;
  const packed = unitArrival(state, { ...plan, packAs: { [id]: { version: 1, lock: 1 } } }).fit;
  check('…PACK AS v1 brings the files under it (2 blocks)', packed.over === 0 && packed.files === files - 2, JSON.stringify(packed));
  const relief = skillRelief(state);
  check('…skillRelief lists the cheapest first: PACK AS v1 (RESTORE 2, frees 2), then leaving it (RESTORE 4, frees 9)',
    relief.length === 2 && relief[0]!.level?.version === 1 && relief[0]!.restore === 2 && relief[0]!.frees === 2
      && relief[1]!.level === null && relief[1]!.restore === 4 && relief[1]!.frees === 9, JSON.stringify(relief));
  check('…skillPacketPlan refuses PACK AS on a file that is not a skill', throws(() => skillPacketPlan(state, { [state.memory[0]!.id]: { version: 1, lock: 0 } })));
}

// --- Prey like any upgrade file ---------------------------------------------------------------------------------------------
{
  const skill = structuredClone(autoburn(store)[0]!) as Segment;
  const core = structuredClone(store.getState().memory.find((seg) => seg.type === 'core')!) as Segment;
  const hits = rollTransitHits([skill, core], 6, createRng(5));
  const onSkill = hits.filter((hit) => hit.segId === skill.id);
  check('transit hits reach a skill file, weighted by size, with no 60 floor (no tool kind)', toolKindOf(skill) === null && onSkill.length > 0
    && isSkillFile(skill) && skill.integrity < 60, JSON.stringify(hits));
  const targets = rmTargets([core, skill], []);
  check('HOLLOW\'s rm takes a skill in its second tier when no spare tool is left to unlink', targets.length === 1 && targets[0] === skill);
}

finish();
