// Skill files (phase 3 slice 4; docs/phase3/03-skills.md §3.3–§3.4, slice-4-plan §2.3, §2.6, §2.7): a fresh file at a
// level, the packet's skill plan (purchases, upgrades, RESTORE, PACK AS) that draft.ts planPacket applies, the one mid-run
// install, the boot's TRAINED / RETRAINED lines, and the version watcher. Track TREE owns this file after the FOUNDATION
// (plan §5.2); mountSkillWatch's event is UI's to show.
import type { Store } from '@state/store';
import type { GameState, TransitPlan } from '@state/schema';
import type { Segment, SkillFileSegment } from '@/types/segment';
import type { SkillId, SkillLevel } from '@/types/skill';
import {
  replaceRange, mergeAdjacentFree, assertMemoryInvariants, newSegId, unitInstallAddress, segmentStarts, freeSegment,
} from '@systems/memory-ops';
import { layoutOf } from '@data/memory';
import { skillBlocks, SKILL_FILE_TEXT } from '@data/skills';
import { notBuilt } from '@systems/not-built';
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

// A skill given outright, for __ap.skill and the suites (tests/unit/support/skills.ts giveSkillFile): the unit's old file of
// that skill (if any) leaves memory, a fresh one at `level` is installed, and the run records a free purchase from before
// the tree (cost 0, visit 0), as a migrated save's free AUTOBURN is recorded: the bank does not move, and a file lost
// later reads as lost (RESTORE, NO AUTOBURN.skl), not as never trained. Not a game path: a kid's skills come by the packet.
export function giveSkill(store: Store<GameState>, id: SkillId, level: Readonly<SkillLevel>): SkillFileSegment {
  const memory = store.getState().memory;
  for (const old of memory.filter((seg) => seg.type === 'upgrade' && seg.upgrade === id)) {
    const addr = segmentStarts(memory)[memory.indexOf(old)]!;
    replaceRange(memory, addr, addr + old.size, [freeSegment(old.size)], { opId: null, own: [old] });
  }
  mergeAdjacentFree(memory);
  const file = installSkillFile(store, id, level);
  store.update((draft) => {
    draft.run.skills.bought.push({ skill: id, kind: 'train', to: { version: level.version, lock: level.lock }, cost: 0, visit: 0 });
  });
  return file;
}

// --- The packet (Track TREE: stubs with their final signatures) ----------------------------------------------------------

// What this desk's training does to the packet (plan §2.6): the fresh files (trained, upgraded or restored at this desk,
// each replacing the unit's old file of that skill, if any) and the files PACK AS lowers (segId → the lower level).
export interface SkillPacketPlan {
  fresh: { skill: SkillId; level: SkillLevel; replaces: string | null }[];
  packAs: Readonly<Record<string, SkillLevel>>;
}

// The plan from the run's pending purchases and the PACKET's PACK AS choices. Pure.
export function skillPacketPlan(state: Readonly<GameState>, packAs: Readonly<TransitPlan['packAs']>): SkillPacketPlan {
  return notBuilt('skillPacketPlan', 'TREE', state, packAs);
}

// What planPacket feeds packUnit for the skill plan: the ids that leave the packet (the replaced files and the originals
// PACK AS lowers; internal, never shown as drops), and the files that join it (the fresh ones, and the lowered copies,
// which keep their integrity and infection at the lower size). Pure: `makeId` names the new files.
export interface SkillPacketEdit {
  removed: string[];
  added: SkillFileSegment[];
}

export function applySkillPlan(
  memory: readonly Segment[], plan: Readonly<SkillPacketPlan>, makeId: (prefix: string) => string,
): SkillPacketEdit {
  return notBuilt('applySkillPlan', 'TREE', memory, plan, makeId);
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

// The skill lines this boot types, in SKILL_IDS order, from the arrival (ArrivalReport.skills), the demos since each
// skill's last line (RunSkillState.announced) and the grants due (RunSkillState.skillGrants). Pure: the boot plans them at
// its first tick and says each through applySkillBootLine. FOUNDATION: none yet (Track TREE fills it).
export function skillBootLines(state: Readonly<GameState>): SkillBootLine[] {
  void state;
  return [];
}

// The boot says `line` (systems/boot.ts): records it (announced; a grant's install through installSkillFile) and emits the
// event the ONLINE stamp hangs on. Stateful.
export function applySkillBootLine(store: Store<GameState>, line: Readonly<SkillBootLine>): void {
  notBuilt('applySkillBootLine', 'TREE', store, line);
}

// --- The watcher (plan §2.7) -----------------------------------------------------------------------------------------------

// Mounted post-tick: emits 'skill-version' {skill, from, to} when a skill's effective version moves (a bite, a REPAIR, a
// file taken offline), silent on a ship's first tick (keyed by run.rev). Nothing is stored: a resume re-reads it silently.
// Returns the unmount.
export function mountSkillWatch(store: Store<GameState>): () => void {
  return notBuilt('mountSkillWatch', 'TREE', store);
}
