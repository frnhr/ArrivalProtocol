// Slice 4 FOUNDATION (docs/phase3/impl/slice-4-plan.md §5.1 item 7, §6): the skill tree's data and its pure cores, store
// level, under a second.
// • The table (03 §3.2, §3.4; plan §4.1): its validator passes, 54 cycles in all, a full set of 34 blocks, the largest
//   file SKILL_MAX_BLOCKS (AUTOBURN v3 with LOCK 810), sizes and prices by cell.
// • Graded damage (03 §3.5): the effective version and lock for every band, and skillLive's copy that counts (missing,
//   offline, damaged, the better of two copies).
// • The bank: earned + granted − bought − pending, throwing below 0. Held, paid, lost and RESTORE (decision 16): the plan's
//   cross-checks (AUTODROP v3 lost 8, packed as v1 7; AUTOBURN v2 + LOCK 270 lost 5, packed as v1 3).
// • The cycle steps (03 §3.1): Q = 0.2k exactly lands on step k; 1 to 6 per ship; nobody aboard throws.
// • The demos: the last AUTO_DEMO_WINDOW count; none is UNTRAINED (7.5 tac s late, 40%).
// • The desk's required first pick (deskBlocker): the arm's first desk only, until a 'train' is pending.
// • The save: v1 saves dumped before the tree (tests/unit/save/fixtures/, a SHIP DONE at desk 1, one at desk 2 carrying
//   phase 2's free AUTOBURN.skl, and a BEAM into KESTREL carrying it) migrate to v2, decode and resume; the old AUTOBURN is
//   v1 lock 0 and bought for nothing, so eaten it costs RESTORE 2; the ships ended earn their cycles; desk 1 gets the
//   first-pick floor; announced keeps phase 2's trained count; an install phase 2 still owed is paid as v1's price; a v2 save
//   with a pending purchase or a corrupt skills record is refused.
// • The grid (follow-up M2/B2): 'start' branches are derived (AUTOBURN v1 from visit 1, the rest from visit 2), cells read
//   owned, pending, lost, affordable, dim, closed and unbuilt on migrated desks; the first pick made clears deskBlocker.
// • Slices 4c–4e FOUNDATION (slice-4cde-plan §7.1, §8.1): the v3 fixtures (tests/unit/save/fixtures/run-save-v3-*) migrate
//   to v4, decode and resume with every new field at rest; the step's seedsMetAtDepth from the evidence; endShip's lasting
//   record and seedsMet across a seedless ship (R11); the LandingController registry's order (R3); DEMO_WORDS' measure and
//   AUTODROP's learning (R5, R21). The codec's v4 refusals are save/codec's; gap G1 is walked live in save/resume.
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { Segment, SkillFileSegment } from '@/types/segment';
import type { RunSkillState, SkillPurchase } from '@/types/skill';
import { createStore } from '@state/store';
import { createInitialState, createRunSkills, createAutodropState } from '@state/initial';
import { SKILL_TREE, SKILL_IDS, skillBlocks, levelPrice, treeTotalCycles, fullSetBlocks, validateSkillTree } from '@data/skills';
import { effectiveVersion, effectiveLock, skillLive, capabilitiesNow, type Band } from '@systems/capabilities';
import {
  bankOf, held, paid, lostLevels, restorePrice, demoSkill, autoburnDemoSkill, AUTOBURN_DEMO_TUNING, deskBlocker, fileLevel,
  treeCells, openBranchesAt, visitNow, seedsMet, AUTODROP_DEMO_TUNING, DEMO_SOURCES, type TreeCell,
} from '@systems/skill-tree';
import { registerLandingController, activeLandingController, windowRuleHolds, LANDING_CONTROLLER_ORDER } from '@systems/landing-controller';
import { DEMO_WORDS, BOOT_SKILL_TEXT, TRAINING_TEXT } from '@data/training-text';
import { SKILL_4CDE_RULES } from '@data/script';
import { trainingModel } from '@systems/training-model';
import { autoburnHoldsLandingOrbit } from '@state/selectors';
import { DISGUISE_POOL } from '@data/threat-text';
import { shipCycles } from '@systems/run-score';
import { decodeRunSave, migrateRunSave } from '@systems/save-codec';
import { resumeRun } from '@systems/run-save';
import { pendingRunSave } from '@systems/save-write';
import { skillFile } from '@systems/skill-files';
import { assertMemoryInvariants, freeSegment, mergeAdjacentFree, segmentStarts, replaceRange } from '@systems/memory-ops';
import { layoutOf } from '@data/memory';
import { stubStorage, pageOpen, receiveToReport, toDesk, beamTo, WORKED_ROUTE } from '../save/save-fixture';
import { giveSkillFile, pendPurchase, pickFirstSkill } from '../support/skills';
import { RUN_SAVE_VERSION, RUN_SAVE_KEY, META_STORAGE_KEY, SKILL_MAX_BLOCKS, FIRST_PICK_FLOOR_CYCLES, MAX_LINE_CHARS } from '@data/tuning';

const throws = (run: () => unknown): boolean => { try { run(); return false; } catch { return true; } };

// --- The table -------------------------------------------------------------------------------------------------------------
check('the tree passes its validator at load (and again on demand)', !throws(validateSkillTree));
check('four skills, one per branch, in SKILL_IDS order', SKILL_IDS.join() === 'autoburn,autodrop,survey,sentry'
  && new Set(SKILL_IDS.map((id) => SKILL_TREE[id].branch)).size === 4);
check('the whole tree costs 54 cycles (the RUN TALLY\'s `TRAINED n of 54`)', treeTotalCycles() === 54, String(treeTotalCycles()));
check('a full set at v3 (LOCK 810) is 34 blocks', fullSetBlocks() === 34, String(fullSetBlocks()));
check('the largest file is AUTOBURN v3 + LOCK 810 = 12 = SKILL_MAX_BLOCKS', skillBlocks('autoburn', 3, 2) === 12 && SKILL_MAX_BLOCKS === 12);
check('sizes by cell: AUTOBURN v1 6, v1 + 270 7, v2 + 270 9; AUTODROP v1 4, v3 10; SENTRY v1 3',
  skillBlocks('autoburn', 1, 0) === 6 && skillBlocks('autoburn', 1, 1) === 7 && skillBlocks('autoburn', 2, 1) === 9
  && skillBlocks('autodrop', 1, 0) === 4 && skillBlocks('autodrop', 3, 0) === 10 && skillBlocks('sentry', 1, 0) === 3);
check('…a lock on a skill without LOCK RANGE throws', throws(() => skillBlocks('autodrop', 1, 1)));
check('prices by cell: roots 3 (SURVEY and SENTRY 2), v2 5, v3 8; LOCK 270 1, LOCK 810 2',
  levelPrice('autoburn', { kind: 'version', version: 1 }) === 3 && levelPrice('autodrop', { kind: 'version', version: 2 }) === 5
  && levelPrice('autoburn', { kind: 'version', version: 3 }) === 8 && levelPrice('survey', { kind: 'version', version: 1 }) === 2
  && levelPrice('autoburn', { kind: 'lock', level: 1 }) === 1 && levelPrice('autoburn', { kind: 'lock', level: 2 }) === 2);
// What this build implements, one check per skill so each track raises only its own line (slice-4cde foundation review M1).
// FLIGHT: Track ORBIT raises AUTOBURN to v3 here.
check('built: AUTOBURN v1–v2', SKILL_TREE.autoburn.built === 2);
// LANDING: Track DROP raises AUTODROP to v3 here.
check('built: AUTODROP not yet', SKILL_TREE.autodrop.built === 0);
// SURVEY: slice 6.
check('built: SURVEY not yet', SKILL_TREE.survey.built === 0);
// DEFENCE: Track SENTRY raises SENTRY to v3 here.
check('built: SENTRY v1–v3', SKILL_TREE.sentry.built === 3);
// (end of the built checks)

// --- Graded damage (03 §3.5) -----------------------------------------------------------------------------------------------
const bands: Band[] = ['ok', 'degraded', 'failing', 'dead', 'missing'];
const table = bands.map((band) => `${band}:${([1, 2, 3] as const).map((v) => effectiveVersion(v, band)).join('')}`).join(' ');
check('the effective version per band: ok v, damaged one lower (v1 stays v1), failing two lower, dead and missing off',
  table === 'ok:123 degraded:112 failing:001 dead:000 missing:000', table);
const locks = bands.map((band) => `${band}:${([0, 1, 2] as const).map((l) => String(effectiveLock(l, band))).join(',')}`).join(' ');
check('the effective lock: ok its level, damaged one lower (810 → 270 → 90), failing 90, dead none',
  locks === 'ok:0,1,2 degraded:0,0,1 failing:0,0,0 dead:null,null,null missing:null,null,null', locks);

{
  const id = (n: number): string => `t${n}`;
  const file = (integrity: number, version: 1 | 2 | 3, state?: SkillFileSegment['state']): SkillFileSegment => {
    const seg = skillFile('autoburn', { version, lock: version === 3 ? 2 : 1 }, () => id(integrity * 10 + version));
    seg.integrity = integrity;
    if (state !== undefined) seg.state = state;
    return seg;
  };
  const none = skillLive([], 'autoburn');
  check('skillLive with no file: missing, OFF, no lock, no nominal level', none.band === 'missing' && none.version === 0 && none.lock === null
    && none.file === null && none.nominal === null);
  const bitten = skillLive([file(64, 2)], 'autoburn');
  check('an AUTOBURN v2 + 270 at 64%: works as v1 at LOCK 90, nominal v2 + 270 (the walk\'s `WORKS AS v1`)', bitten.version === 1
    && bitten.lock === 0 && bitten.band === 'degraded' && bitten.nominal?.version === 2 && bitten.nominal.lock === 1);
  const repairing = skillLive([file(90, 2, 'repairing')], 'autoburn');
  check('a file being repaired is offline: OFF, and says why', repairing.version === 0 && repairing.band === 'dead' && repairing.offline === 'repairing'
    && repairing.file !== null);
  const v3 = skillLive([file(50, 3)], 'autoburn');
  check('PHASE3\'s example: v3 at 50% works as v2 (LOCK 810 → 270)', v3.version === 2 && v3.lock === 1);
  const two = skillLive([file(30, 3), file(95, 1)], 'autoburn');
  check('of two copies the one that works best counts (a v3 at 30% works as v1; a v1 at 95% as v1 with the higher health)',
    two.version === 1 && two.file?.integrity === 95);
  const h = createStore<GameState>(createInitialState({ seed: 3 }));
  giveSkillFile(h, 'autoburn', 2, 1);
  check('Capabilities.skills lists the four skills, AUTOBURN v2 + 270 live after giveSkillFile', capabilitiesNow(h.getState()).skills.autoburn.version === 2
    && capabilitiesNow(h.getState()).skills.autoburn.lock === 1 && capabilitiesNow(h.getState()).skills.sentry.band === 'missing'
    && !throws(() => assertMemoryInvariants(h.getState().memory, layoutOf(h.getState()).totalBlocks)));
  const wrong = structuredClone(h.getState().memory) as Segment[];
  const skill = wrong.find((seg) => seg.type === 'upgrade' && seg.upgrade === 'autoburn') as SkillFileSegment;
  skill.version = 1;
  check('assertMemoryInvariants: a skill file whose size is not its level\'s throws', throws(() => assertMemoryInvariants(wrong, layoutOf(h.getState()).totalBlocks)));
  check('…giveSkillFile records a free purchase from before the tree (cost 0, visit 0): the bank does not move',
    paid(h.getState().run.skills, 'autoburn')?.version === 2 && bankOf(h.getState().run.skills) === 0
    && h.getState().run.skills.bought[0]?.cost === 0 && h.getState().run.skills.bought[0]?.visit === 0);
}

// --- The bank, held, paid, lost, RESTORE -------------------------------------------------------------------------------------
{
  const buy = (skill: SkillPurchase['skill'], kind: SkillPurchase['kind'], version: 1 | 2 | 3, lock: 0 | 1 | 2, cost: number): SkillPurchase => (
    { skill, kind, to: { version, lock }, cost, visit: 1 });
  const skills: RunSkillState = {
    ...createRunSkills(),
    earned: [{ slot: 0, arrived: 1, landed: 4, pct: 83 }, { slot: 2, arrived: 1, landed: 5, pct: 100 }],
    grants: [{ source: 'first-pick', cycles: 0, visit: 1, label: null }, { source: 'salvage', cycles: 2, visit: 1, label: null }],
    bought: [buy('autoburn', 'train', 1, 0, 3)],
    pending: [buy('autoburn', 'train', 2, 0, 5), buy('autoburn', 'lock', 2, 1, 1)],
  };
  check('the bank: 5 + 6 earned, 2 granted, 3 bought, 6 pending = 4', bankOf(skills) === 4, String(bankOf(skills)));
  check('…below 0 throws (fail loudly)', throws(() => bankOf({ ...skills, pending: [...skills.pending, buy('autodrop', 'train', 1, 0, 9)] })));
  check('paid is the highest level bought or pending, componentwise (v2 + LOCK 270)', paid(skills, 'autoburn')?.version === 2
    && paid(skills, 'autoburn')?.lock === 1 && paid(skills, 'autodrop') === null);
  const empty = createInitialState({ seed: 3 });
  const desk = { memory: empty.memory, run: { ...empty.run, skills } };
  check('held with no file but pending purchases: their level (v2 + 270)', held(desk, 'autoburn')?.version === 2 && held(desk, 'autoburn')?.lock === 1
    && fileLevel(empty.memory, 'autoburn') === null && held(desk, 'sentry') === null);
  const lostAll = lostLevels('autodrop', null, { version: 3, lock: 0 });
  check('AUTODROP v3 lost: v1 v2 v3, RESTORE ⌈16 / 2⌉ = 8 (03 §3.4\'s chip)', lostAll.length === 3 && restorePrice(lostAll) === 8);
  check('AUTODROP v3 packed as v1: v2 v3 lost, RESTORE ⌈13 / 2⌉ = 7', restorePrice(lostLevels('autodrop', { version: 1, lock: 0 }, { version: 3, lock: 0 })) === 7);
  check('AUTOBURN v2 + LOCK 270 lost: RESTORE ⌈9 / 2⌉ = 5', restorePrice(lostLevels('autoburn', null, { version: 2, lock: 1 })) === 5);
  const packed = lostLevels('autoburn', { version: 1, lock: 1 }, { version: 2, lock: 1 });
  check('AUTOBURN v2 + 270 packed as v1 (the lock kept, 7 blocks): v2 lost, RESTORE ⌈5 / 2⌉ = 3 (the walk\'s step 7)',
    packed.length === 1 && packed[0]!.row.kind === 'version' && restorePrice(packed) === 3 && skillBlocks('autoburn', 1, 1) === 7);
  check('nothing lost: [] and RESTORE 0; held above paid (a grant) loses nothing',
    lostLevels('autoburn', { version: 2, lock: 1 }, { version: 2, lock: 1 }).length === 0 && restorePrice([]) === 0
    && lostLevels('autoburn', { version: 2, lock: 0 }, { version: 1, lock: 0 }).length === 0 && lostLevels('autoburn', null, null).length === 0);
}

// --- The cycle steps (03 §3.1) -----------------------------------------------------------------------------------------------
{
  const aboard = 1000;
  const steps = [0, 1, 2, 3, 4, 5].map((k) => shipCycles({ slot: 0, points: 200 * k, colonistsAboard: aboard }));
  check('Q = 0.2k exactly lands on step k (no float drop: 0.6 × 5 is 3, not 2.99…), so 1 to 6 cycles',
    steps.map((step) => step.arrived + step.landed).join() === '1,2,3,4,5,6' && steps.every((step) => step.arrived === 1), JSON.stringify(steps));
  const odd = [0.199, 0.83, 0.999, 1].map((q) => shipCycles({ slot: 4, points: q * 1200, colonistsAboard: 1200 }));
  check('…between steps it floors (19.9% +0, 83% +4 named 83, 99.9% +4); only every point is PERFECT (+5)',
    odd.map((step) => step.landed).join() === '0,4,4,5' && odd[1]!.pct === 83, JSON.stringify(odd));
  check('…nobody aboard, or more points than colonists, throws', throws(() => shipCycles({ slot: 0, points: 0, colonistsAboard: 0 }))
    && throws(() => shipCycles({ slot: 0, points: 300, colonistsAboard: 200 })));
}

// --- Demos (03 §3.3) -----------------------------------------------------------------------------------------------------------
{
  const untrained = autoburnDemoSkill({ demos: [] });
  check('no demos: UNTRAINED, 7.5 tac s late, ACCURACY 40% (plan §7 R3)', untrained.untrained && untrained.learnedOffsetTac === 7.5
    && untrained.accuracy === 40 && untrained.demos === 0);
  const offsets = [20, 20, 20, 0, 0, 0, 0, 0, 0, 0, 0].map((offsetTac) => ({ offsetTac }));
  const recent = demoSkill(offsets, AUTOBURN_DEMO_TUNING);
  check('only the last 8 count ("last 8 replaces all", so improvement shows): 11 demos, the 3 sloppy ones forgotten',
    recent.demos === 11 && recent.learnedOffsetTac === 0 && recent.accuracy === 99 && !recent.untrained, JSON.stringify(recent));
}

// --- The desk's required first pick --------------------------------------------------------------------------------------------
{
  const storage = stubStorage();
  const store = createStore<GameState>(createInitialState({ seed: 7 }));
  pageOpen(store, storage, 7);
  receiveToReport(store);
  toDesk(store);
  check('the arm\'s first desk: SET COURSE waits for the first pick', deskBlocker(store.getState()) === 'first-pick');
  store.update((d) => { d.run.skills.pending.push({ skill: 'autoburn', kind: 'train', to: { version: 1, lock: 0 }, cost: 3, visit: 1 }); });
  check('…a pending train frees it', deskBlocker(store.getState()) === null);
  const classic = createInitialState({ seed: 7, phase: 'desk' });
  check('…the classic world never blocks (no tree)', deskBlocker(classic) === null);
}

// --- The save: v1 → v2 ---------------------------------------------------------------------------------------------------------
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'save', 'fixtures');
const fixture = (file: string): { save: Record<string, unknown>; meta: unknown } => JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'));

for (const [file, point, carries] of [
  ['run-save-v1-ship-done.json', 'ship-done', false], ['run-save-v1-ship-done-autoburn.json', 'ship-done', true],
  ['run-save-v1-beam-autoburn.json', 'beam', true],
] as const) {
  const { save, meta } = fixture(file);
  const migrated = migrateRunSave(save);
  const run = (migrated.payload as { run: GameState['run'] & { skillTrainedOn?: unknown } }).run;
  const decoded = decodeRunSave(JSON.stringify(save));
  check(`${file}: a v1 ${point} save migrates to v${RUN_SAVE_VERSION} and decodes`, save.saveVersion === 1 && migrated.saveVersion === RUN_SAVE_VERSION
    && decoded.ok, decoded.ok ? '' : `${decoded.refusal.kind}: ${decoded.refusal.detail}`);
  check(`…skillTrainedOn is gone, run.skills and stats.dropDemos are fresh, every ended ship earned its cycles`, !('skillTrainedOn' in run)
    && run.skills.pending.length === 0 && run.stats.dropDemos.length === 0 && run.skills.earned.length === run.ships.length && run.ships.length > 0);
  const strips = migrated.payload as { slices?: { memory: Segment[] }; carried?: { segs: Segment[] } };
  const memory = strips.slices?.memory ?? strips.carried?.segs ?? [];
  const autoburn = memory.filter((seg) => seg.type === 'upgrade' && seg.upgrade === 'autoburn') as SkillFileSegment[];
  check(carries ? '…phase 2\'s free AUTOBURN.skl is v1 + LOCK 90 (6 blocks), bought for nothing before the tree'
    : '…no AUTOBURN, nothing bought', carries
    ? autoburn.length === 1 && autoburn[0]!.version === 1 && autoburn[0]!.lock === 0 && autoburn[0]!.size === 6
      && run.skills.bought.length === 1 && run.skills.bought[0]!.cost === 0 && run.skills.bought[0]!.visit === 0
    : autoburn.length === 0 && run.skills.bought.length === 0);
  check(`…announced keeps what phase 2's boot last said (${carries ? 'trained on 2 captures' : 'never trained'})`,
    run.skills.announced.autoburn === (carries ? 2 : null) && run.skills.grants.every((grant) => grant.source !== 'migration'));
  if (point === 'ship-done' && run.ships.length === 1) {
    check('…at the first desk the bank is topped up to the first-pick floor (the resumed desk does not open again)',
      bankOf(run.skills) === FIRST_PICK_FLOOR_CYCLES && run.skills.grants.some((grant) => grant.source === 'first-pick'), String(bankOf(run.skills)));
  }
  if (point === 'ship-done' || point === 'beam') {
    if (strips.slices !== undefined) {
      const auto = (strips.slices as unknown as { burn: { auto: GameState['burn']['auto'] } }).burn.auto;
      check('…burn.auto gains its mode fields, empty', auto.mode === null && auto.targetKm === null && !auto.claimed && auto.waitingSinceTSec === null);
    }
  }
  // It resumes: the page opens on the stored save and the archive, and RESUME rebuilds the run.
  const storage = stubStorage({ [RUN_SAVE_KEY]: JSON.stringify(save), [META_STORAGE_KEY]: JSON.stringify(meta) });
  const store = createStore<GameState>(createInitialState({ seed: 1 }));
  pageOpen(store, storage, 1);
  const offered = store.getState().save.status === 'ok' && store.getState().save.resume !== null && pendingRunSave() !== null;
  if (offered) resumeRun(store);
  const resumed = store.getState();
  check(`…and resumes (${point === 'beam' ? 'KESTREL\'s boot' : 'the desk'})`, offered && resumed.save.status === 'ok'
    && resumed.run.phase === (point === 'beam' ? 'boot' : 'desk') && !throws(() => assertMemoryInvariants(resumed.memory, layoutOf(resumed).totalBlocks)),
    JSON.stringify({ save: resumed.save, phase: resumed.run.phase }));
  if (carries && point === 'ship-done') {
    // HOLLOW eats it (or a long hop leaves it): what was paid is lost, and costs RESTORE 2 (half of v1's 3, rounded up).
    const memoryNow = store.getState().memory;
    const index = memoryNow.findIndex((seg) => seg.type === 'upgrade' && seg.upgrade === 'autoburn');
    const addr = segmentStarts(memoryNow)[index]!;
    replaceRange(memoryNow, addr, addr + memoryNow[index]!.size, [freeSegment(memoryNow[index]!.size)], { opId: null, own: [memoryNow[index]!] });
    mergeAdjacentFree(memoryNow);
    const lost = lostLevels('autoburn', held(store.getState(), 'autoburn'), paid(store.getState().run.skills, 'autoburn'));
    check('…eaten since, the migrated AUTOBURN is offered for RESTORE 2', lost.length === 1 && restorePrice(lost) === 2);
  }
}

// An install phase 2 still owed: two captures, no file yet (the boot that would have installed it never comes).
{
  const { save } = fixture('run-save-v1-ship-done.json');
  const owed = structuredClone(save) as { payload: { run: Record<string, unknown> & { stats: { demos: unknown[] } } } };
  owed.payload.run.stats.demos = [{ offsetTac: 3 }, { offsetTac: 1 }];
  const run = (migrateRunSave(owed as unknown as Record<string, unknown>).payload as { run: GameState['run'] }).run;
  const grant = run.skills.grants.find((entry) => entry.source === 'migration');
  check('a v1 save owed phase 2\'s install (2 captures, no file) is paid AUTOBURN v1\'s price: +3 cycles, nothing bought',
    grant?.cycles === 3 && run.skills.bought.length === 0 && run.skills.announced.autoburn === null && decodeRunSave(JSON.stringify(owed)).ok,
    JSON.stringify(run.skills.grants));
}

// The grid on resumed desks (follow-up B2, M2).
const resumeFixture = (file: string): ReturnType<typeof createStore<GameState>> => {
  const { save, meta } = fixture(file);
  const storage = stubStorage({ [RUN_SAVE_KEY]: JSON.stringify(save), [META_STORAGE_KEY]: JSON.stringify(meta) });
  const store = createStore<GameState>(createInitialState({ seed: 1 }));
  pageOpen(store, storage, 1);
  resumeRun(store);
  return store;
};
const look = (cells: readonly TreeCell[], row: string): string => {
  const cell = cells.find((c) => c.skill === 'autoburn' && (c.row.kind === 'version' ? `v${c.row.version}` : `L${c.row.level}`) === row);
  return cell === undefined ? 'none' : `${cell.look}${cell.refusal === null ? '' : `/${cell.refusal}`}`;
};
{
  const store = resumeFixture('run-save-v1-ship-done.json');
  const visit = visitNow(store.getState().run);
  const cells = treeCells(store.getState(), visit);
  check('desk 1 (migrated): only the \'start\' branches that are built are open, derived (AUTOBURN; AUTODROP not built yet)',
    visit === 1 && openBranchesAt(store.getState(), 1).join() === 'autoburn' && store.getState().run.skills.opened.length === 0);
  check('…AUTOBURN v1 is affordable for the floor\'s 3; v2, v3 and LOCK RANGE open from visit 2; the other branches closed',
    look(cells, 'v1') === 'affordable' && look(cells, 'v2') === 'closed/closed' && look(cells, 'v3') === 'closed/closed'
      && look(cells, 'L1') === 'closed/closed' && cells.filter((cell) => cell.skill !== 'autoburn').every((cell) => cell.look === 'closed')
      && cells.find((cell) => cell.skill === 'autoburn' && cell.row.kind === 'version' && cell.row.version === 1)?.blocks === 6,
    ['v1', 'v2', 'v3', 'L1', 'L2'].map((row) => look(cells, row)).join(' '));
  check('…SET COURSE waits for the pick', deskBlocker(store.getState()) === 'first-pick');
  pendPurchase(store, { skill: 'autoburn', kind: 'train', to: { version: 1, lock: 0 }, cost: 3, visit: 1 });
  check('…the pick made (pending): deskBlocker clears, v1 reads pending, the bank is 0', deskBlocker(store.getState()) === null
    && look(treeCells(store.getState(), 1), 'v1') === 'pending/owned' && bankOf(store.getState().run.skills) === 0);
}
{
  const store = resumeFixture('run-save-v1-ship-done-autoburn.json');
  const state = store.getState();
  const bank = bankOf(state.run.skills);
  const cells = treeCells(state, visitNow(state.run));
  const v2 = look(cells, 'v2');
  check('desk 2 (migrated, phase 2\'s AUTOBURN): v1 owned, v2 and LOCK 270 open (affordable or dim by the bank), v3 unbuilt, LOCK 810 needs 270',
    visitNow(state.run) === 2 && look(cells, 'v1') === 'owned/owned' && v2 === (bank >= 5 ? 'affordable' : 'dim/unaffordable')
      && look(cells, 'v3') === 'unbuilt/closed' && look(cells, 'L2') === 'dim/needs-lower',
    `bank ${bank}: ${['v1', 'v2', 'v3', 'L1', 'L2'].map((row) => look(cells, row)).join(' ')}`);
  const memory = store.getState().memory;
  const index = memory.findIndex((seg) => seg.type === 'upgrade' && seg.upgrade === 'autoburn');
  const addr = segmentStarts(memory)[index]!;
  replaceRange(memory, addr, addr + memory[index]!.size, [freeSegment(memory[index]!.size)], { opId: null, own: [memory[index]!] });
  mergeAdjacentFree(memory);
  const lostCells = treeCells(store.getState(), 2);
  check('…its file eaten: v1 reads lost (RESTORE is the way back), and v2 needs it first', look(lostCells, 'v1') === 'lost/lost'
    && look(lostCells, 'v2') === 'dim/needs-lower', ['v1', 'v2'].map((row) => look(lostCells, row)).join(' '));
}

{
  const { save } = fixture('run-save-v1-ship-done-autoburn.json');
  const v2 = migrateRunSave(save) as { payload: { run: GameState['run'] } };
  const pending = structuredClone(v2);
  pending.payload.run.skills.pending.push({ skill: 'autoburn', kind: 'train', to: { version: 2, lock: 0 }, cost: 5, visit: 2 });
  const refusedPending = decodeRunSave(JSON.stringify(pending));
  check('a v2 save with a pending purchase is refused (purchases are undoable until TRANSMIT ▸, never saved)',
    !refusedPending.ok && refusedPending.refusal.kind === 'shape' && refusedPending.refusal.detail.includes('skills.pending'),
    refusedPending.ok ? '' : refusedPending.refusal.detail);
  const corrupt = structuredClone(v2);
  (corrupt.payload.run.skills.bought[0] as unknown as Record<string, unknown>).skill = 'autopilot';
  const refusedCorrupt = decodeRunSave(JSON.stringify(corrupt));
  check('…and one whose skills name an unknown skill', !refusedCorrupt.ok && refusedCorrupt.refusal.kind === 'shape'
    && refusedCorrupt.refusal.detail.includes('skills.bought[0].skill'), refusedCorrupt.ok ? '' : refusedCorrupt.refusal.detail);
}

// --- Slices 4c–4e FOUNDATION (slice-4cde-plan §7.1, §8.1) ------------------------------------------------------------------

// The v3 fixtures (dumped before the v4 bump): each migrates to v4, decodes and resumes, with every new field at rest.
for (const [file, point] of [
  ['run-save-v3-ship-done-desk2.json', 'ship-done'], ['run-save-v3-beam-seeds.json', 'beam'], ['run-save-v3-ship-done-lost.json', 'ship-done'],
] as const) {
  const { save, meta } = fixture(file);
  const migrated = migrateRunSave(save) as { saveVersion: number; payload: { run: GameState['run']; slices?: { landing: GameState['landing']; burn: GameState['burn'] } } };
  const run = migrated.payload.run;
  const decoded = decodeRunSave(JSON.stringify(save));
  check(`${file}: a v3 ${point} save migrates to v${RUN_SAVE_VERSION} and decodes`, save.saveVersion === 3 && migrated.saveVersion === RUN_SAVE_VERSION
    && decoded.ok, decoded.ok ? '' : `${decoded.refusal.kind}: ${decoded.refusal.detail}`);
  const slices = migrated.payload.slices;
  check('…AUTODROP at rest, burn.auto not holding (a world payload); every arrival seed names no decoy',
    (slices === undefined || (isDeepStrictEqual(slices.landing.autodrop, createAutodropState()) && slices.burn.auto.holding === false))
      && (run.arrival?.seeds ?? []).every((seed) => seed.disguise === null));
  const seeded = (run.arrival?.seeds.length ?? 0) > 0;
  check(`…seedsMetAtDepth from the evidence: ${seeded ? `the beam's seeds, KESTREL's depth ${run.shipIndex + 1}` : 'none met, null'}`,
    run.threat.seedsMetAtDepth === (seeded ? run.shipIndex + 1 : null), String(run.threat.seedsMetAtDepth));
  const storage = stubStorage({ [RUN_SAVE_KEY]: JSON.stringify(save), [META_STORAGE_KEY]: JSON.stringify(meta) });
  const store = createStore<GameState>(createInitialState({ seed: 1 }));
  pageOpen(store, storage, 1);
  const offered = store.getState().save.status === 'ok' && pendingRunSave() !== null;
  if (offered) resumeRun(store);
  check(`…and resumes (${point === 'beam' ? 'KESTREL\'s boot' : 'the desk'})`, offered && store.getState().run.phase === (point === 'beam' ? 'boot' : 'desk'),
    JSON.stringify(store.getState().save));
  if (file === 'run-save-v3-ship-done-lost.json') {
    const lost = lostLevels('autoburn', held(store.getState(), 'autoburn'), paid(store.getState().run.skills, 'autoburn'));
    check('…the lost fixture (AUTOBURN v1 deleted in ship 2) offers RESTORE 2 (gap G1; save/resume walks it live)',
      lost.length === 1 && restorePrice(lost) === 2 && fileLevel(store.getState().memory, 'autoburn') === null);
  }
}
{
  // A world point after a ship whose HOLLOW landed its own seeds; one of a run whose TRACE already counts an earlier ship.
  const { save } = fixture('run-save-v3-ship-done-desk2.json');
  const landed = structuredClone(save) as { payload: { run: GameState['run']; slices: { hollow: GameState['hollow'] } } };
  landed.payload.slices.hollow.seedsLanded = 1;
  const traced = structuredClone(save) as { payload: { run: GameState['run'] } };
  traced.payload.run.threat.trace = 1;
  const depthOf = (raw: unknown): number | null => (migrateRunSave(raw as Record<string, unknown>).payload as { run: GameState['run'] }).run.threat.seedsMetAtDepth;
  check('the v3 → v4 step: HOLLOW\'s seeds landed on the ship just ended record its depth; TRACE records the last ended ship',
    depthOf(landed) === 2 && depthOf(traced) === 2 && decodeRunSave(JSON.stringify(landed)).ok, `${depthOf(landed)} ${depthOf(traced)}`);
}

// The lasting record (R11): endShip writes the first ship that met a seed, once; seedsMet reads it, across a seedless ship.
{
  const storage = stubStorage();
  const store = createStore<GameState>(createInitialState({ seed: 7 }));
  pageOpen(store, storage, 7);
  receiveToReport(store);
  toDesk(store);
  check('no seed met on ARES-VII: the record is null, and seedsMet false', store.getState().run.threat.seedsMetAtDepth === null && !seedsMet(store.getState()));
  pickFirstSkill(store);
  for (const slot of [WORKED_ROUTE[1]!, WORKED_ROUTE[2]!]) beamTo(store, slot);
  const beamed = store.getState().run.arrival?.seeds.length ?? 0;
  toDesk(store);
  check('KESTREL arrived with beam seeds: its endShip records depth 3', beamed > 0 && store.getState().run.threat.seedsMetAtDepth === 3,
    String(store.getState().run.threat.seedsMetAtDepth));
  beamTo(store, WORKED_ROUTE[3]!);
  store.update((draft) => {
    // A seedless ship whose kid rm'd everything: none of 4a's fading evidence is left.
    draft.run.arrival!.seeds = [];
    draft.run.threat.trace = 0;
    draft.run.threat.fed = 0;
    draft.hollow.seedsLanded = 0;
    draft.memory = draft.memory.map((seg) => (seg.type === 'hollow' && seg.beam === true ? freeSegment(seg.size) : seg));
    mergeAdjacentFree(draft.memory);
  });
  toDesk(store);
  const threat = store.getState().run.threat;
  check('…after a seedless VESPER the record stays 3 and seedsMet holds (TRACE 0, no seed, nothing left)',
    threat.seedsMetAtDepth === 3 && seedsMet(store.getState()) && threat.trace === 0 && (threat.lastTally?.left ?? 0) === 0,
    JSON.stringify({ at: threat.seedsMetAtDepth, trace: threat.trace, left: threat.lastTally?.left }));
}

// A ship that ends with SENTRY's pre-empt armed (review m1): endShip lets it go, so SHIP DONE's save resumes.
{
  const storage = stubStorage();
  const store = createStore<GameState>(createInitialState({ seed: 7 }));
  pageOpen(store, storage, 7);
  receiveToReport(store);
  store.update((draft) => { draft.hollow.seedTelegraph = { startAddr: 40, size: 2, leftSec: 1, preempted: true }; });
  toDesk(store);
  const raw = storage.data.get(RUN_SAVE_KEY);
  const decoded = raw === undefined ? null : decodeRunSave(raw);
  check('a ship ending with an armed pre-empt: endShip clears it, and the SHIP DONE save decodes (the outline kept, not armed)',
    store.getState().hollow.seedTelegraph?.preempted === false && decoded?.ok === true,
    decoded === null ? 'no save' : decoded.ok ? '' : decoded.refusal.detail);
}

// The LandingController registry (R3): MERGE over the resident over AUTODROP, derived each time it is asked.
{
  const state = createInitialState({ seed: 3 });
  const controller = (source: 'autodrop' | 'resident' | 'merge') => ({ source, holdsTactical: true, launchesFromMind: false, decide: () => null });
  let mergeFlies = false;
  const offs = [
    registerLandingController('autodrop', () => controller('autodrop')),
    registerLandingController('resident', () => controller('resident')),
    registerLandingController('merge', () => (mergeFlies ? controller('merge') : null)),
  ];
  const resident = activeLandingController(state)?.source;
  mergeFlies = true;
  const merge = activeLandingController(state)?.source;
  check('the registry asks in LANDING_CONTROLLER_ORDER (merge, resident, autodrop): the resident over AUTODROP, MERGE over both',
    LANDING_CONTROLLER_ORDER.join() === 'merge,resident,autodrop' && resident === 'resident' && merge === 'merge');
  check('…a second registration of a source throws', throws(() => registerLandingController('autodrop', () => null)));
  for (const off of offs) off();
  check('…unregistered, no controller: the window rule holds', activeLandingController(state) === null && windowRuleHolds(state));
  const offWrong = registerLandingController('autodrop', () => controller('resident'));
  check('…a resolver answering for another source throws', throws(() => activeLandingController(state)));
  offWrong();
}

// The demo words and AUTODROP's learning (R5, R21).
{
  check('DEMO_WORDS: captures read ACCURACY, drops AIM, and a drop is a drop (not a landing)', DEMO_WORDS.captures.measure === 'ACCURACY'
    && DEMO_WORDS.drops.measure === 'AIM' && DEMO_WORDS.drops.one === 'drop' && DEMO_WORDS.drops.many === 'drops');
  const untrained = demoSkill([], AUTODROP_DEMO_TUNING);
  const sloppy = demoSkill([{ offsetTac: 4 }, { offsetTac: 4 }], AUTODROP_DEMO_TUNING);
  const tidy = demoSkill([{ offsetTac: 0.3 }, { offsetTac: -0.1 }], AUTODROP_DEMO_TUNING);
  check('AUTODROP untrained: 1.5 tac s late, AIM 40%; its demos clamp at ±1 (AIM 60); a tidy kid (+0.3, −0.1) teaches AIM 98',
    untrained.untrained && untrained.learnedOffsetTac === 1.5 && untrained.accuracy === 40 && sloppy.learnedOffsetTac === 1
    && sloppy.accuracy === 60 && tidy.accuracy === 98 && DEMO_SOURCES.drops?.tuning === AUTODROP_DEMO_TUNING, JSON.stringify([untrained, sloppy, tidy]));
  check('…the boot says it: `from your 3 drops · AIM 96%`', BOOT_SKILL_TEXT.trained('AUTODROP.skl', 1, 3, 'drops', 96)
    === '> SKILL TRAINED: AUTODROP.skl v1 · from your 3 drops · AIM 96%');
}

// ARRIVAL CONTROL's v3 line (03 §7) at a desk whose purchases train a v3, any skill; and the GO LOWER gate's selector (R16).
{
  const store = resumeFixture('run-save-v3-ship-done-desk2.json');
  const before = trainingModel(store.getState()).control;
  pendPurchase(store, { skill: 'autodrop', kind: 'train', to: { version: 3, lock: 0 }, cost: 0, visit: 2 });
  check('ARRIVAL CONTROL says `Our repository has everything you need. :)` once this desk trains a v3 (none before)',
    before === null && trainingModel(store.getState()).control === TRAINING_TEXT.controlV3, `${before} / ${trainingModel(store.getState()).control}`);
  const engaged = (phase: GameState['burn']['auto']['phase'], mode: GameState['burn']['auto']['mode']): boolean => {
    const state = createInitialState({ seed: 3 });
    return autoburnHoldsLandingOrbit({ ...state, burn: { ...state.burn, auto: { ...state.burn.auto, phase, mode } } });
  };
  check('autoburnHoldsLandingOrbit: armed, pointing or burning in \'landing-orbit\' only',
    engaged('armed', 'landing-orbit') && engaged('burning', 'landing-orbit') && !engaged('done', 'landing-orbit') && !engaged('armed', 'round')
      && !engaged('idle', null));
}

// The FOUNDATION's own new words fit the strip: the four lessons, ARRIVAL CONTROL's v3 line, the decoys' INSPECT lines.
{
  const lines = [
    ...SKILL_4CDE_RULES.map((rule) => rule.text({} as never)), TRAINING_TEXT.controlV3, ...DISGUISE_POOL.map((entry) => `${entry.name} · ${entry.desc}`),
  ];
  check(`the foundation's new lines are ≤ ${MAX_LINE_CHARS} characters`, SKILL_4CDE_RULES.length === 4 && lines.every((line) => line.length <= MAX_LINE_CHARS),
    lines.filter((line) => line.length > MAX_LINE_CHARS).join(' | '));
}

finish();
