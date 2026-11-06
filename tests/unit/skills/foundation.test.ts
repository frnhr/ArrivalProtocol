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
//   first-pick floor; a v2 save with a pending purchase or a corrupt skills record is refused.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { Segment, SkillFileSegment } from '@/types/segment';
import type { RunSkillState, SkillPurchase } from '@/types/skill';
import { createStore } from '@state/store';
import { createInitialState, createRunSkills } from '@state/initial';
import { SKILL_TREE, SKILL_IDS, skillBlocks, levelPrice, treeTotalCycles, fullSetBlocks, validateSkillTree } from '@data/skills';
import { effectiveVersion, effectiveLock, skillLive, capabilitiesNow, type Band } from '@systems/capabilities';
import {
  bankOf, held, paid, lostLevels, restorePrice, demoSkill, autoburnDemoSkill, AUTOBURN_DEMO_TUNING, deskBlocker, fileLevel,
} from '@systems/skill-tree';
import { shipCycles } from '@systems/run-score';
import { decodeRunSave, migrateRunSave } from '@systems/save-codec';
import { resumeRun } from '@systems/run-save';
import { pendingRunSave } from '@systems/save-write';
import { skillFile } from '@systems/skill-files';
import { assertMemoryInvariants, freeSegment, mergeAdjacentFree, segmentStarts, replaceRange } from '@systems/memory-ops';
import { layoutOf } from '@data/memory';
import { stubStorage, pageOpen, receiveToReport, toDesk } from '../save/save-fixture';
import { giveSkillFile } from '../support/skills';
import { RUN_SAVE_VERSION, RUN_SAVE_KEY, META_STORAGE_KEY, SKILL_MAX_BLOCKS, FIRST_PICK_FLOOR_CYCLES } from '@data/tuning';

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
check('4a builds AUTOBURN v1–v2 only', SKILL_TREE.autoburn.built === 2 && SKILL_IDS.filter((id) => id !== 'autoburn').every((id) => SKILL_TREE[id].built === 0));

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

finish();
