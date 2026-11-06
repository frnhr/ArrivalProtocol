// The skill tree's types (phase 3 slice 4, docs/phase3/03-skills.md; docs/phase3/impl/slice-4-plan.md §2.2). After the
// FOUNDATION, Track TREE owns this file (plan §5.2): the other tracks ask by message.
//
// • The tree is data (data/skills.ts SKILL_TREE): four skills, one per branch, each with three versions and (AUTOBURN only)
//   two LOCK RANGE levels on a side axis. Prerequisites only run within a branch.
// • A skill is a file (types/segment.ts SkillFileSegment): what the unit holds is what is in memory, at the version and lock
//   the file says. Damage is not loss: a damaged file works at a lower effective version (capabilities.ts skillLive).
// • The run keeps only history (RunSkillState): what each ship earned, what was granted, what was bought. The bank, the
//   paid level and the lost levels are derived from it and memory (systems/skill-tree.ts), never stored, so a later change
//   to the cycle rule or the prices never rewrites a save's past, and "eaten, unlinked, deleted, left behind, packed lower"
//   all read the same way without event bookkeeping.

export type SkillId = 'autoburn' | 'autodrop' | 'survey' | 'sentry';
export type SkillBranch = 'flight' | 'landing' | 'survey' | 'defence';
export type SkillVersion = 1 | 2 | 3;
// 0 is OFF: a skill with no file, or one too damaged (or offline) to work.
export type EffectiveVersion = 0 | SkillVersion;
// LOCK RANGE (03 §3.7): 0 = 90 tac s (comes with AUTOBURN v1), 1 = 270, 2 = 810 (tuning.ts LOCK_RANGE_TAC). Always 0 on the
// other skills (assertMemoryInvariants checks it).
export type LockLevel = 0 | 1 | 2;

// One version of a skill: what it is called on its cell (`CAPTURE`), its price in cycles and its file's size in blocks.
export interface VersionDef {
  version: SkillVersion;
  mode: string;
  price: number;
  blocks: number;
}

// One LOCK RANGE level: its price, and the block it adds to the file.
export interface LockDef {
  level: 1 | 2;
  price: number;
  blocks: 1;
}

// When a branch opens (03 §3.2). 'start': v1 at visit 1, the higher versions (and LOCK RANGE) from visit 2 (FLIGHT,
// LANDING). 'after-seeds': the first visit from `minVisit` after a ship that met seeds (DEFENCE). 'poor-ahead': the first
// visit from `minVisit` with a POOR-data planet among the reachable next ships (SURVEY). At most one new branch per visit
// past visit 2 (skill-tree.ts openBranchesAt; latched in RunSkillState.opened).
export type OpenRule =
  | { kind: 'start' }
  | { kind: 'after-seeds'; minVisit: number }
  | { kind: 'poor-ahead'; minVisit: number };

export interface SkillDef {
  id: SkillId;
  branch: SkillBranch;
  fileName: string;                 // 'AUTOBURN.skl'
  short: string;                    // 'AB': the strip's tiny chip
  versions: readonly [VersionDef, VersionDef, VersionDef];
  locks: readonly LockDef[];        // AUTOBURN's two; [] on every other skill
  opens: OpenRule;
  // Where its precision comes from (03 §3.3): the kid's manual captures (run.stats.demos), launches (stats.dropDemos), or
  // nothing (SURVEY and SENTRY have no demos).
  demos: 'captures' | 'drops' | null;
  // The highest version this build implements (0: the branch is not built and never opens; its row reads OPENS LATER).
  // 4a: AUTOBURN 2, the rest 0; 4c AUTODROP 3, 4d SENTRY 3, 4e AUTOBURN 3, slice 6 SURVEY 3.
  built: EffectiveVersion;
}

// A skill file's level: its version and (AUTOBURN only) its lock.
export interface SkillLevel {
  version: SkillVersion;
  lock: LockLevel;
}

// A cell of the TRAINING grid: a version, or a LOCK RANGE level (AUTOBURN only).
export type CellRow = { kind: 'version'; version: SkillVersion } | { kind: 'lock'; level: 1 | 2 };

// One level the unit paid for and no longer holds (skill-tree.ts lostLevels), with its price (RESTORE is a fraction of
// the sum, 03 §3.3, decision 16).
export interface LostLevel {
  row: CellRow;
  price: number;
}

// A purchase at a desk (03 §3.3): train a version, a LOCK RANGE level, or RESTORE what was lost. `to` is the skill's whole
// level once the purchase lands (a lock bought on v2 is {2, 1}). `visit` is the desk's (run.ships.length there: 1 after
// ship 1); 0 marks a purchase from before the tree (a migrated save's free AUTOBURN, a suite's giveSkillFile).
export type PurchaseKind = 'train' | 'lock' | 'restore';

export interface SkillPurchase {
  skill: SkillId;
  kind: PurchaseKind;
  to: SkillLevel;
  cost: number;
  visit: number;
}

// What one ended ship earned (03 §3.1): ARRIVED +1 always, LANDED +1 for every full 20% of points ÷ colonists aboard
// (run-score.ts shipCycles). `pct` is the rounded share the LANDING REPORT's line names. Recorded per ship, so a later rule
// never rewrites a save's past.
export interface CycleEarning {
  slot: number;
  arrived: 1;
  landed: number;   // 0..CYCLES_LANDED_STEPS
  pct: number;      // 0..100
}

// Cycles from anywhere but a ship's landing: the first-pick floor (visit 1), the +2 CYCLES salvage card, a resident or a
// story stop (slice 5). `label` is the line a slice-5 source shows (`taught by MOTH`); null for the built-in sources.
export interface CycleGrant {
  source: 'first-pick' | 'salvage' | 'resident' | 'story';
  cycles: number;
  visit: number;
  label: string | null;
}

// A skill given, not bought (slice 5: the sleeper's skill, 03 §5's grant interface): written by skill-tree.ts grantSkill,
// installed at the next boot (skill-files.ts skillBootLines: `> SKILL TRAINED: … · from the sleeper on CURLEW`).
// `installedAtDepth`: the route depth whose boot installed it (null until then), so a grant is installed once.
export interface SkillGrant {
  skill: SkillId;
  version: SkillVersion;
  source: string;
  installedAtDepth: number | null;
}

export interface RunSkillState {
  earned: CycleEarning[];        // one per ended ship (run.ts endShip, on every world)
  grants: CycleGrant[];
  bought: SkillPurchase[];       // committed at TRANSMIT ▸ (training.ts commitTraining)
  pending: SkillPurchase[];      // this desk's, undoable; [] at every save point (the codec checks it)
  skillGrants: SkillGrant[];     // slice 5; [] until then
  opened: { skill: SkillId; visit: number }[];   // the branches latched open, at openDesk
  // The demo count each skill's last TRAINED / RETRAINED boot line named (null: never announced): later demos retrain it
  // at the next boot (03 §3.3: `> SKILL RETRAINED`).
  announced: Record<SkillId, number | null>;
}

// What the archive keeps of the unit's skills (03 §3.11; LastUnit.skills): each skill it ended with, and AUTOBURN's
// accuracy (null for a skill with no demos). REASSIGNMENT (slice 7) hunts the highest version.
export interface SkillRecord {
  skill: SkillId;
  version: SkillVersion;
  lock: LockLevel;
  accuracy: number | null;
}

// What AUTOBURN flies once engaged (03 §3.6; fixed at engagement, state.burn.auto.mode): v1 the capture; v2 makes the
// orbit green, and on a green orbit round; v3 (4e) the landing orbit.
export type AutoMode = 'capture' | 'green' | 'round' | 'landing-orbit';

// What a skill learned from the kid's hands (03 §3.3; skill-tree.ts demoSkill): the demos it counts (the last
// AUTO_DEMO_WINDOW), when it fires against the right moment (+ late, − early, tac s) and its ACCURACY %. `untrained`: no
// demos at all (03's loud UNTRAINED state, plan §7 R3: it fires AUTOBURN_UNTRAINED_OFFSET_TAC late, which is what 40% means).
export interface DemoSkill {
  demos: number;
  learnedOffsetTac: number;
  accuracy: number;
  untrained: boolean;
}

// The numbers a demo-trained skill learns by (AUTOBURN's from tuning.ts; AUTODROP's in 4c).
export interface DemoTuning {
  window: number;            // the last n demos count
  factor: number;            // it learns this share of their mean offset
  maxOffsetTac: number;      // clamped to ±this
  accuracyPerTac: number;    // ACCURACY = 100 − this × |offset|
  accuracyMin: number;
  accuracyMax: number;
  untrainedOffsetTac: number;
}
