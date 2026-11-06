// Slices 4c–4e: the lead owns this file (slice-4cde-plan.md §7.2); each track edits only its own skill's `built` line.
// The skill tree as data (phase 3 slice 4; docs/phase3/03-skills.md §3.2, §3.4; slice-4-plan §4.1): four skills, one per
// branch, three versions each, and AUTOBURN's LOCK RANGE side axis; the files' names and sizes; and the validator every
// number passes at load. Data only: the rules that read it are systems/skill-tree.ts's. After the FOUNDATION, Track TREE
// owns this file (plan §5.2).
import type { SkillId, SkillDef, SkillVersion, LockLevel, CellRow } from '@/types/skill';
import {
  SKILL_MAX_BLOCKS, FIRST_PICK_FLOOR_CYCLES, CYCLES_ARRIVED, CYCLES_LANDED_STEPS, CYCLES_PER_STEP_PCT, LOCK_RANGE_TAC,
  AUTO_THREAD_CLAIM_TAC, TACTICAL_LEAD_BURN_TAC, HEAL_BEATS_DRAIN_FACTOR, BAND_DEGRADED_MIN, AUTODROP_CLAIM_TAC,
  WINDOW_TACTICAL_LEAD_TAC,
} from '@data/tuning';
import { HOLLOW_STAGES, SEEDS_ONLY_DEF } from '@data/threats';
import { repairRatePerSec } from '@data/fs-tools';

// The tree's order: the grid's columns, the boot's lines, the Skills window's rows, and where a skill file sorts among the
// unit's files (carry.ts packs skills after the AI tools in this order, so a replaced file keeps its place).
export const SKILL_IDS: readonly SkillId[] = ['autoburn', 'autodrop', 'survey', 'sentry'];

// The four skills (03 §3.2's table, its WHYs): each cell is a price in cycles and a size in blocks.
// • Roots 3: a ship-1 landing buys one, never two (a ship pays 1–6).
// • v2 5: about one good ship.
// • v3 8: more than any ship pays, so a focused branch reaches it around ship 4 or 5, when the big ships come.
// • LOCK RANGE 1 and 2: cheap, as PHASE3 asks; each adds a block.
// • SURVEY cheaper (9 in all): its value depends on how many POOR-data planets the route meets.
// • SENTRY v3 5: a free wall on every ship is strong.
// • Sizes: bigger versions cost link, room, charge and repair time, and give HOLLOW and the seeds more to bite (03 §3.4);
//   the largest file is SKILL_MAX_BLOCKS.
// • `built`: what this build implements (types/skill.ts SkillDef). 4a: AUTOBURN v1–v2 only. Slices 4c–4e: each track
//   raises its own skill's `built` line only (DROP autodrop 0 → 3, SENTRY sentry 0 → 3, ORBIT autoburn 2 → 3).
export const SKILL_TREE: Readonly<Record<SkillId, SkillDef>> = {
  autoburn: {
    id: 'autoburn', branch: 'flight', fileName: 'AUTOBURN.skl', short: 'AB',
    versions: [
      { version: 1, mode: 'CAPTURE', price: 3, blocks: 6 },
      { version: 2, mode: 'GREEN, THEN ROUND', price: 5, blocks: 8 },
      { version: 3, mode: 'LANDING ORBIT', price: 8, blocks: 10 },
    ],
    locks: [{ level: 1, price: 1, blocks: 1 }, { level: 2, price: 2, blocks: 1 }],
    opens: { kind: 'start' }, demos: 'captures', built: 2,
  },
  autodrop: {
    id: 'autodrop', branch: 'landing', fileName: 'AUTODROP.skl', short: 'AD',
    versions: [
      { version: 1, mode: 'CENTRE', price: 3, blocks: 4 },
      { version: 2, mode: 'PASS', price: 5, blocks: 7 },
      { version: 3, mode: 'PLAN', price: 8, blocks: 10 },
    ],
    locks: [], opens: { kind: 'start' }, demos: 'drops', built: 3,
  },
  survey: {
    id: 'survey', branch: 'survey', fileName: 'SURVEY.skl', short: 'SV',
    versions: [
      { version: 1, mode: 'FIND', price: 2, blocks: 3 },
      { version: 2, mode: 'RATE', price: 3, blocks: 4 },
      { version: 3, mode: 'SWEEP', price: 4, blocks: 6 },
    ],
    // Visit 4 at the earliest: 01 keys POOR site data by layer (from layer 5), and two long hops reach layer 5 at depth 3.
    locks: [], opens: { kind: 'poor-ahead', minVisit: 4 }, demos: null, built: 0,
  },
  sentry: {
    id: 'sentry', branch: 'defence', fileName: 'SENTRY.skl', short: 'SN',
    versions: [
      { version: 1, mode: 'SIGHT', price: 2, blocks: 3 },
      { version: 2, mode: 'QUICK RM', price: 3, blocks: 4 },
      { version: 3, mode: 'FIREWALL', price: 5, blocks: 6 },
    ],
    // Visit 3: after the first seeds (KESTREL's beam on the worked route).
    locks: [], opens: { kind: 'after-seeds', minVisit: 3 }, demos: null, built: 3,
  },
};

// The files as INSPECT and the strip name them. Track TREE owns the words (the chip lines are TRANSMIT's, the boot's
// training-text.ts BOOT_SKILL_TEXT).
export const SKILL_FILE_TEXT: Readonly<Record<SkillId, { name: string; desc: string }>> = {
  autoburn: {
    name: SKILL_TREE.autoburn.fileName,
    // Phase 2's words with the training moved to the desk (Track TREE / FLIGHT reword it for v2's GREEN and ROUND).
    desc: `A skill trained between ships, sharpened by braking at ▼ yourself. Press [B] near ▼ and it flies the capture for you, into the ring or until a trim is left, even while you are in the MIND. Works while healthy (${BAND_DEGRADED_MIN}% or more). It can be eaten.`,
  },
  autodrop: {
    name: SKILL_TREE.autodrop.fileName,
    desc: 'A skill trained between ships, sharpened by your own launches. It drops the pods for you. Damage costs it a version. It can be eaten.',
  },
  survey: {
    name: SKILL_TREE.survey.fileName,
    desc: 'A skill trained between ships. It finds and rates landing sites under the swath. Damage costs it a version. It can be eaten.',
  },
  sentry: {
    name: SKILL_TREE.sentry.fileName,
    desc: 'A skill trained between ships. It sees the seeds that hide as files. Damage costs it a version. It can be eaten.',
  },
};

export function skillDef(id: SkillId): SkillDef {
  const def = SKILL_TREE[id];
  if (def === undefined) throw new Error(`skills: no skill '${String(id)}'`);
  return def;
}

// A skill file's size at a level (03 §3.4): its version's blocks, plus a block per LOCK RANGE level. Throws on a lock a skill
// does not have.
export function skillBlocks(id: SkillId, version: SkillVersion, lock: LockLevel): number {
  const def = skillDef(id);
  if (lock > def.locks.length) throw new Error(`skills: ${def.fileName} has no LOCK RANGE level ${lock}`);
  return def.versions[version - 1]!.blocks + def.locks.slice(0, lock).reduce((sum, level) => sum + level.blocks, 0);
}

// The price of one cell (a version, or a LOCK RANGE level), in cycles.
export function levelPrice(id: SkillId, row: CellRow): number {
  const def = skillDef(id);
  if (row.kind === 'version') return def.versions[row.version - 1]!.price;
  const lock = def.locks[row.level - 1];
  if (lock === undefined) throw new Error(`skills: ${def.fileName} has no LOCK RANGE level ${row.level}`);
  return lock.price;
}

// The whole tree's price (the RUN TALLY's `TRAINED n of 54`) and a full set's blocks at v3 (and LOCK 810).
export function treeTotalCycles(): number {
  return SKILL_IDS.reduce((sum, id) => {
    const def = SKILL_TREE[id];
    return sum + def.versions.reduce((v, version) => v + version.price, 0) + def.locks.reduce((l, lock) => l + lock.price, 0);
  }, 0);
}

export function fullSetBlocks(): number {
  return SKILL_IDS.reduce((sum, id) => sum + skillBlocks(id, 3, SKILL_TREE[id].locks.length as LockLevel), 0);
}

// 03 §3.2 and §3.4's figures the table must keep (the spec's arithmetic, cross-checked): a re-pricing that moves them
// must move the spec with it (slice 8).
const SPEC_TREE_CYCLES = 54;
const SPEC_FULL_SET_BLOCKS = 34;

// Throws on a tree that breaks a rule of 03 §3.2–§3.4 (run at load).
export function validateSkillTree(): void {
  const fail = (why: string): never => { throw new Error(`skills: ${why}`); };
  if (SKILL_IDS.length !== Object.keys(SKILL_TREE).length) fail('SKILL_IDS and SKILL_TREE disagree');
  const branches = new Set<string>();
  const shipPayMax = CYCLES_ARRIVED + CYCLES_LANDED_STEPS;
  for (const id of SKILL_IDS) {
    const def = SKILL_TREE[id];
    if (def.id !== id) fail(`SKILL_TREE.${id} is '${def.id}'`);
    if (branches.has(def.branch)) fail(`two skills on the ${def.branch} branch`);
    branches.add(def.branch);
    if (!def.fileName.endsWith('.skl')) fail(`${def.fileName} is not a .skl file`);
    def.versions.forEach((version, i) => {
      if (version.version !== i + 1) fail(`${def.fileName}'s versions are out of order`);
      if (!(Number.isInteger(version.price) && version.price > 0 && Number.isInteger(version.blocks) && version.blocks > 0)) {
        fail(`${def.fileName} v${version.version}'s price and blocks must be positive whole numbers`);
      }
      const before = def.versions[i - 1];
      // Prices and sizes rise within a branch: a higher version is never cheaper or smaller.
      if (before !== undefined && !(version.price > before.price && version.blocks > before.blocks)) {
        fail(`${def.fileName} v${version.version} must cost more and be larger than v${before.version}`);
      }
    });
    // A root the first-pick floor can always buy. The two branches open from the start keep their v3 above what any one
    // ship pays, so a focused branch reaches it around ship 4 (SURVEY and SENTRY are cheaper by design: 03 §3.2).
    if (def.versions[0].price > FIRST_PICK_FLOOR_CYCLES) fail(`${def.fileName} v1 costs more than the first-pick floor`);
    if (def.opens.kind === 'start' && !(def.versions[2].price > shipPayMax)) fail(`${def.fileName} v3 must cost more than one ship pays (${shipPayMax})`);
    def.locks.forEach((lock, i) => {
      if (lock.level !== i + 1) fail(`${def.fileName}'s LOCK RANGE levels are out of order`);
      const before = def.locks[i - 1];
      if (before !== undefined && !(lock.price > before.price)) fail(`${def.fileName} LOCK level ${lock.level} must cost more than ${before.level}`);
    });
    if (def.locks.length > 0 && def.locks.length !== LOCK_RANGE_TAC.length - 1) fail('LOCK_RANGE_TAC has a range per lock level, and v1\'s');
    if (def.locks.length > 0 && def.id !== 'autoburn') fail(`${def.fileName} has LOCK RANGE (AUTOBURN's side axis only)`);
    if (def.locks.length > 2) fail(`${def.fileName} has more lock levels than LockLevel holds`);
    if (!(def.built >= 0 && def.built <= 3)) fail(`${def.fileName}'s built version is ${def.built}`);
    const largest = skillBlocks(id, 3, def.locks.length as LockLevel);
    if (largest > SKILL_MAX_BLOCKS) fail(`${def.fileName} v3 is ${largest} blocks, over SKILL_MAX_BLOCKS ${SKILL_MAX_BLOCKS}`);
  }
  if (!LOCK_RANGE_TAC.every((range, i) => i === 0 || range > LOCK_RANGE_TAC[i - 1]!)) fail('LOCK_RANGE_TAC must rise');
  const largest = Math.max(...SKILL_IDS.map((id) => skillBlocks(id, 3, SKILL_TREE[id].locks.length as LockLevel)));
  if (largest !== SKILL_MAX_BLOCKS) fail(`the largest file is ${largest} blocks; SKILL_MAX_BLOCKS says ${SKILL_MAX_BLOCKS}`);
  if (treeTotalCycles() !== SPEC_TREE_CYCLES) fail(`the tree costs ${treeTotalCycles()}, 03 §3.2 says ${SPEC_TREE_CYCLES}`);
  if (fullSetBlocks() !== SPEC_FULL_SET_BLOCKS) fail(`a full set is ${fullSetBlocks()} blocks, 03 §3.4 says ${SPEC_FULL_SET_BLOCKS}`);
  if (CYCLES_LANDED_STEPS * CYCLES_PER_STEP_PCT !== 100) fail('CYCLES_LANDED_STEPS × CYCLES_PER_STEP_PCT must be 100 (the fifth step needs every point)');
  // 03 §3.7: the claim lands with the burn's TACTICAL lead.
  if (AUTO_THREAD_CLAIM_TAC !== TACTICAL_LEAD_BURN_TAC) fail('AUTO_THREAD_CLAIM_TAC must equal TACTICAL_LEAD_BURN_TAC');
  // Slice 4c (plan §2.6): AUTODROP claims with the window's TACTICAL lead, so its claim never costs a thread at CRUISE.
  if (AUTODROP_CLAIM_TAC !== WINDOW_TACTICAL_LEAD_TAC) fail('AUTODROP_CLAIM_TAC must equal WINDOW_TACTICAL_LEAD_TAC');
  // 03 §3.4's fairness rule (§6.6): a repair started before zero on the largest skill outruns every HOLLOW's worst drain,
  // the larger multiplier applying, never the product (04-threats.md). A drain that rises shrinks SKILL_MAX_BLOCKS.
  const defs = [...Object.values(HOLLOW_STAGES).map((stage) => stage.hollow), SEEDS_ONLY_DEF];
  const worstDrain = Math.max(...defs.map((hollow) => hollow.drainPerSec * Math.max(hollow.burnMult, hollow.landMult)));
  const heal = repairRatePerSec(SKILL_MAX_BLOCKS, 1);
  if (!(heal > HEAL_BEATS_DRAIN_FACTOR * worstDrain)) {
    fail(`REPAIR v1 heals a ${SKILL_MAX_BLOCKS}-block skill at ${heal.toFixed(1)}%/s, under ${HEAL_BEATS_DRAIN_FACTOR} × the worst drain (${worstDrain}%/s)`);
  }
}
validateSkillTree();
