// Skill files (phase 3 slice 4; docs/phase3/03-skills.md §3.3–§3.4, slice-4-plan §2.3, §2.6, §2.7): a fresh file at a
// level, the packet's skill plan (purchases, upgrades, RESTORE, PACK AS) that draft.ts planPacket applies, the one mid-run
// install, the boot's TRAINED / RETRAINED lines, and the version watcher. Track TREE owns this file after the FOUNDATION
// (plan §5.2); mountSkillWatch's event is UI's to show.
import type { Store } from '@state/store';
import type { GameState, TransitPlan } from '@state/schema';
import type { Segment, SkillFileSegment } from '@/types/segment';
import type { SkillId, SkillLevel, EffectiveVersion } from '@/types/skill';
import {
  replaceRange, mergeAdjacentFree, assertMemoryInvariants, newSegId, unitInstallAddress, segmentStarts, freeSegment,
} from '@systems/memory-ops';
import { layoutOf } from '@data/memory';
import { skillBlocks, SKILL_FILE_TEXT, SKILL_TREE, SKILL_IDS } from '@data/skills';
import { skillFilesOf, isSkillFile } from '@state/selectors';
import { held, paid, levelAbove, skillDemos, lostLevels, restorePrice } from '@systems/skill-tree';
import { skillLive } from '@systems/capabilities';
import { onPostTick } from '@systems/clock';
import { emit } from '@systems/events';
import { BOOT_SKILL_TEXT } from '@data/training-text';
import { IS_DEV } from '@/env';
import { INTEGRITY_MAX } from '@data/tuning';

// A fresh skill file at `level` (03 §3.3: new training is new code, so a trained, upgraded or restored file arrives clean
// and at 100%), with an id from `makeId` (the PACKET's previews pass draft.ts PREVIEW_ID; a real write newSegId). Pure.
export function skillFile(id: SkillId, level: Readonly<SkillLevel>, makeId: (prefix: string) => string): SkillFileSegment {
  return {
    id: makeId(id), name: SKILL_FILE_TEXT[id].name, type: 'upgrade', upgrade: id, version: level.version, lock: level.lock,
    size: skillBlocks(id, level.version, level.lock), integrity: INTEGRITY_MAX, state: 'intact', scanned: true, desc: SKILL_FILE_TEXT[id].desc,
  };
}

// Writes a fresh skill file into memory now (memory-ops.ts unitInstallAddress: where every mid-run unit file goes) and
// returns it. No purchase is recorded: a grant's boot line (slice 5), __ap.skill and the suites' giveSkillFile write their
// own history. Throws with no room (a layout that can't take its own unit). The way a purchase arrives is the packet, not
// this (planPacket).
export function installSkillFile(store: Store<GameState>, id: SkillId, level: Readonly<SkillLevel>): SkillFileSegment {
  const file = skillFile(id, level, newSegId);
  const memory = store.getState().memory;
  const addr = unitInstallAddress(memory, file.size);
  replaceRange(memory, addr, addr + file.size, [file], { opId: null, own: [] });
  mergeAdjacentFree(memory);
  if (IS_DEV) assertMemoryInvariants(memory, layoutOf(store.getState()).totalBlocks);
  store.update((draft) => { draft.ui.memoryRev++; });
  return file;
}

// The unit's old files of `id` (if any) leave memory and a fresh one at `level` is installed: a grant's boot line and
// giveSkill. No purchase is recorded here.
function replaceSkillFile(store: Store<GameState>, id: SkillId, level: Readonly<SkillLevel>): SkillFileSegment {
  const memory = store.getState().memory;
  for (const old of skillFilesOf(memory, id)) {
    const addr = segmentStarts(memory)[memory.indexOf(old)]!;
    replaceRange(memory, addr, addr + old.size, [freeSegment(old.size)], { opId: null, own: [old] });
  }
  mergeAdjacentFree(memory);
  return installSkillFile(store, id, level);
}

// A skill given outright, for __ap.skill and the suites (tests/unit/support/skills.ts giveSkillFile): the unit's old file of
// that skill (if any) leaves memory, a fresh one at `level` is installed, and the run records a free purchase from before
// the tree (cost 0, visit 0), as a migrated save's free AUTOBURN is recorded: the bank does not move, and a file lost
// later reads as lost (RESTORE, NO AUTOBURN.skl), not as never trained. Not a game path: a kid's skills come by the packet.
export function giveSkill(store: Store<GameState>, id: SkillId, level: Readonly<SkillLevel>): SkillFileSegment {
  const file = replaceSkillFile(store, id, level);
  store.update((draft) => {
    draft.run.skills.bought.push({ skill: id, kind: 'train', to: { version: level.version, lock: level.lock }, cost: 0, visit: 0 });
  });
  return file;
}

// --- The packet (plan §2.6) --------------------------------------------------------------------------------------------------

// What this desk's training does to the packet: the fresh files (trained, upgraded or restored at this desk, each replacing
// the unit's old file of that skill, if any) and the files PACK AS lowers (segId → the lower level).
export interface SkillPacketPlan {
  fresh: { skill: SkillId; level: SkillLevel; replaces: string | null }[];
  packAs: Readonly<Record<string, SkillLevel>>;
}

// No training, nothing packed lower: the plan of every classic packet, and of an arm one with nothing pending.
export const NO_SKILL_PLAN: Readonly<SkillPacketPlan> = { fresh: [], packAs: {} };

// The plan from the run's pending purchases and the PACKET's PACK AS choices. Pure. Each skill with a purchase pending
// crosses as one fresh file at its held level (skill-tree.ts held: the file's level raised by every pending purchase), in
// place of the file it had (an upgrade replaces the file: 03 §3.3). Throws on what the PACKET can't make: a PACK AS on a
// file not in memory, on one trained at this desk, or not below the file's level, and two files of a skill with a purchase
// pending (COPY refuses skills, so a unit has one).
export function skillPacketPlan(state: Readonly<GameState>, packAs: Readonly<TransitPlan['packAs']>): SkillPacketPlan {
  const fresh: SkillPacketPlan['fresh'] = [];
  const pending = state.run.skills.pending;
  for (const id of SKILL_IDS) {
    if (!pending.some((purchase) => purchase.skill === id)) continue;
    const files = skillFilesOf(state.memory, id);
    if (files.length > 1) throw new Error(`skillPacketPlan: ${files.length} ${SKILL_TREE[id].fileName} files in memory with a purchase pending`);
    const level = held(state, id);
    if (level === null) throw new Error(`skillPacketPlan: ${SKILL_TREE[id].fileName} has a purchase pending and no level`);
    fresh.push({ skill: id, level, replaces: files[0]?.id ?? null });
  }
  const lowered: Record<string, SkillLevel> = {};
  for (const [segId, level] of Object.entries(packAs)) {
    const seg = state.memory.find((candidate) => candidate.id === segId);
    if (seg === undefined || !isSkillFile(seg)) throw new Error(`skillPacketPlan: PACK AS on ${segId}, not a skill file in memory`);
    if (pending.some((purchase) => purchase.skill === seg.upgrade)) throw new Error(`skillPacketPlan: PACK AS on ${seg.name}, trained at this desk`);
    if (!(level.lock <= seg.lock && levelAbove({ version: seg.version, lock: seg.lock }, level))) {
      throw new Error(`skillPacketPlan: PACK AS ${seg.name} v${level.version} lock ${level.lock} is not below v${seg.version} lock ${seg.lock}`);
    }
    lowered[segId] = { version: level.version, lock: level.lock };
  }
  return { fresh, packAs: lowered };
}

// What planPacket feeds packUnit for the skill plan: the ids that leave the packet (the replaced files and the originals
// PACK AS lowers; internal, never shown as drops), and the files that join it (the fresh ones, and the lowered copies,
// which keep their id, integrity and infection at the lower size). Pure: `makeId` names the fresh files.
export interface SkillPacketEdit {
  removed: string[];
  added: SkillFileSegment[];
  // The fresh files' ids, by skill (the PACKET's 'trained' chips, ArrivalReport.skills' trained and restored entries).
  fresh: { segId: string; skill: SkillId }[];
}

export function applySkillPlan(
  memory: readonly Segment[], plan: Readonly<SkillPacketPlan>, makeId: (prefix: string) => string,
): SkillPacketEdit {
  const removed: string[] = [];
  const added: SkillFileSegment[] = [];
  const fresh: SkillPacketEdit['fresh'] = [];
  for (const entry of plan.fresh) {
    if (entry.replaces !== null) removed.push(entry.replaces);
    const file = skillFile(entry.skill, entry.level, makeId);
    added.push(file);
    fresh.push({ segId: file.id, skill: entry.skill });
  }
  for (const [segId, level] of Object.entries(plan.packAs)) {
    const seg = memory.find((candidate) => candidate.id === segId);
    if (seg === undefined || !isSkillFile(seg)) throw new Error(`applySkillPlan: PACK AS on ${segId}, not a skill file in memory`);
    removed.push(segId);
    const copy = structuredClone(seg) as SkillFileSegment;
    copy.version = level.version;
    copy.lock = level.lock;
    copy.size = skillBlocks(seg.upgrade, level.version, level.lock);
    added.push(copy);
  }
  return { removed, added, fresh };
}

// What leaving a skill file behind, or packing it lower, would cost (the PACKET's chips and TRAINING's cheapest-to-leave
// hint, 03 §3.4, §4): the blocks it frees and the RESTORE price the next desk would ask, for each skill file the unit holds
// that was not trained at this desk (UNDO is the way back there). `level` null is leaving it behind; else PACK AS at that
// version (the lock kept: 03's `PACK AS v1 (7) · RESTORE 3` for v2 + 270). Cheapest first: by RESTORE, then most blocks.
export interface SkillRelief {
  skill: SkillId;
  segId: string;
  level: SkillLevel | null;
  blocks: number;           // the file's blocks as it would cross (0: left behind)
  frees: number;            // blocks freed against the file as it is
  restore: number;          // RESTORE at the next desk
}

export function skillRelief(state: Readonly<GameState>): SkillRelief[] {
  const options: SkillRelief[] = [];
  for (const id of SKILL_IDS) {
    if (state.run.skills.pending.some((purchase) => purchase.skill === id)) continue;
    const paidFor = paid(state.run.skills, id);
    for (const seg of skillFilesOf(state.memory, id)) {
      const levels: (SkillLevel | null)[] = [null, ...lowerLevels({ version: seg.version, lock: seg.lock })];
      for (const level of levels) {
        const blocks = level === null ? 0 : skillBlocks(id, level.version, level.lock);
        options.push({ skill: id, segId: seg.id, level, blocks, frees: seg.size - blocks, restore: restorePrice(lostLevels(id, level, paidFor)) });
      }
    }
  }
  return options.sort((a, b) => a.restore - b.restore || b.frees - a.frees);
}

// The levels PACK AS offers below a file's (plan §2.6, 03 §3.3): each lower version, with the file's lock kept.
export function lowerLevels(level: Readonly<SkillLevel>): SkillLevel[] {
  const lower: SkillLevel[] = [];
  for (let version = level.version - 1; version >= 1; version--) lower.push({ version: version as SkillLevel['version'], lock: level.lock });
  return lower;
}

// --- The boot (systems/boot.ts plans one 'skill' line per entry) -----------------------------------------------------------

// One skill line of a boot (03 §4): a skill trained (bought, restored or granted: `> SKILL TRAINED: AUTOBURN.skl v1 ·
// from your 1 capture · ACCURACY 92%`) or retrained by new demos (`> SKILL RETRAINED: …`), and the text the boot types.
export interface SkillBootLine {
  skill: SkillId;
  kind: 'trained' | 'retrained' | 'granted';
  level: SkillLevel;
  text: string;
}

// The TRAINED / RETRAINED line's words for a skill at `level`, from the demos it learned from (none: plain; no demos yet:
// UNTRAINED, 03 §3.3's loud state).
function trainedText(state: Readonly<GameState>, id: SkillId, level: Readonly<SkillLevel>, kind: 'trained' | 'retrained'): string {
  const file = SKILL_TREE[id].fileName;
  const demos = skillDemos(state.run.stats, id);
  if (demos === null) return BOOT_SKILL_TEXT.plain(file, level.version);
  if (kind === 'retrained') return BOOT_SKILL_TEXT.retrained(file, level.version, demos.demos, demos.accuracy);
  return demos.untrained ? BOOT_SKILL_TEXT.untrained(file, level.version, demos.accuracy) : BOOT_SKILL_TEXT.trained(file, level.version, demos.demos, demos.accuracy);
}

// The skill lines this boot types, in SKILL_IDS order, at most one per skill:
// • a grant due (RunSkillState.skillGrants not installed yet, slice 5): `> SKILL TRAINED: … · from the sleeper on CURLEW`,
//   installed as it is said;
// • a file trained or restored at the last desk (ArrivalReport.skills): `> SKILL TRAINED: …`;
// • a file carried or packed lower whose skill was announced before and has learned from new demos since
//   (RunSkillState.announced): `> SKILL RETRAINED: …` (03 §3.3). A file never announced (the suites' giveSkillFile, the
//   classic world) is never retrained aloud, so the classic boots keep their lines.
// Pure: the boot plans them at its first tick and says each through applySkillBootLine.
export function skillBootLines(state: Readonly<GameState>): SkillBootLine[] {
  const lines: SkillBootLine[] = [];
  const skills = state.run.skills;
  for (const id of SKILL_IDS) {
    const grant = skills.skillGrants.find((entry) => entry.skill === id && entry.installedAtDepth === null);
    if (grant !== undefined) {
      const level: SkillLevel = { version: grant.version, lock: paid(skills, id)?.lock ?? 0 };
      lines.push({ skill: id, kind: 'granted', level, text: BOOT_SKILL_TEXT.granted(SKILL_TREE[id].fileName, grant.version, grant.source) });
      continue;
    }
    const entry = state.run.arrival?.skills.find((candidate) => candidate.skill === id);
    if (entry === undefined) continue;
    if (entry.kind === 'trained' || entry.kind === 'restored' || entry.kind === 'granted') {
      lines.push({ skill: id, kind: 'trained', level: { ...entry.level }, text: trainedText(state, id, entry.level, 'trained') });
      continue;
    }
    const announced = skills.announced[id];
    const demos = skillDemos(state.run.stats, id);
    if (announced !== null && demos !== null && demos.demos > announced) {
      lines.push({ skill: id, kind: 'retrained', level: { ...entry.level }, text: trainedText(state, id, entry.level, 'retrained') });
    }
  }
  return lines;
}

// The boot says `line` (systems/boot.ts): records it (announced: the demos it named; a grant's file installed in place of
// the old one, and the grant marked done at this depth) and emits 'skill-trained', which the ONLINE stamp and the chime
// hang on (Track UI). Stateful.
export function applySkillBootLine(store: Store<GameState>, line: Readonly<SkillBootLine>): void {
  const state = store.getState();
  const demos = skillDemos(state.run.stats, line.skill);
  if (line.kind === 'granted') {
    const index = state.run.skills.skillGrants.findIndex((entry) => entry.skill === line.skill && entry.installedAtDepth === null);
    if (index < 0) throw new Error(`applySkillBootLine: no grant of ${SKILL_TREE[line.skill].fileName} is due`);
    replaceSkillFile(store, line.skill, line.level);
    const depth = state.run.shipIndex + 1;
    store.update((draft) => { draft.run.skills.skillGrants[index]!.installedAtDepth = depth; });
  }
  store.update((draft) => { draft.run.skills.announced[line.skill] = demos?.demos ?? 0; });
  emit('skill-trained', {
    skill: line.skill, level: { ...line.level }, kind: line.kind, demos: demos?.demos ?? 0,
    accuracy: demos === null || demos.untrained ? null : demos.accuracy,
  });
}

// --- The watcher (plan §2.7) -----------------------------------------------------------------------------------------------

// The phases a skill acts in: a step there is news (the stamp, the sweep). Elsewhere (the boot installing a grant, the desk)
// the watcher follows silently.
const WATCHED_PHASES: readonly GameState['run']['phase'][] = ['flight', 'landing'];

// Mounted post-tick (systems/run.ts mountRun mounts it): emits 'skill-version' {skill, from, to} when a skill's effective
// version moves (a bite, a REPAIR, a file taken offline), silent on a ship's first tick (keyed by run.rev) and outside
// the flight and the landing. Nothing is stored: a resume re-reads it silently. Returns the unmount.
export function mountSkillWatch(store: Store<GameState>): () => void {
  let rev: number | null = null;
  const last = new Map<SkillId, EffectiveVersion>();
  return onPostTick(() => {
    const state = store.getState();
    const fresh = rev !== state.run.rev;
    rev = state.run.rev;
    const loud = !fresh && WATCHED_PHASES.includes(state.run.phase);
    for (const id of SKILL_IDS) {
      const to = skillLive(state.memory, id).version;
      const from = last.get(id);
      last.set(id, to);
      if (loud && from !== undefined && from !== to) emit('skill-version', { skill: id, from, to });
    }
  });
}

