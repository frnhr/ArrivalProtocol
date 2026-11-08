// Slice 4d (slice-4cde-plan §4.3–§4.6, §8.1; Track SENTRY): SENTRY.skl v1–v3.
// • its words at their worst case (foundation review m6: in this suite, not support/words);
// • the opening: the DEFENCE branch opens at visit 3 on the worked route (KESTREL's beam), and later after a seedless ship 3
//   (the lasting record, R11);
// • QUICK RM by the numbers: a seed 1.0 s, a 6-block meal 2.0 s, the root's duel unchanged (R10); the Skills row by version;
// • one store, the tutorial run's beam into KESTREL with its seed dressed as a decoy and SENTRY v3 given before the boot:
//   v1's `> ECC: cache.tmp IS A SEED · RACK E` (unmasked, landing with the ECC line's thunk), v3's `FIREWALL.sys COMPILED`;
//   v2's 1.0 s rm in flight;
// • HOLLOW's own seeds on that ship: the pre-empt (a thread held from the click, `PRE-EMPTED` as it lands, the thread back),
//   v1's `SOMETHING LANDED · RACK D` for one left to land, SENTRY falling below v2 lets an armed one land, a call-off and a
//   full Core release or refuse it;
// • v3 under damage works as v2 (no FIREWALL, still the quick rm); the cap and NO ROOM; the salvage's FIREWALL card hidden
//   while v3 works, and every other deal unchanged.
import '../support/classic-world';
import { check, finish } from '../wp1/harness';
import { createHarness7 } from '../wp7/harness7';
import { lockOn } from '../landing/harness-landing';
import { continueAfterReport } from '../support/classic-flow';
import { giveSkillFile } from '../support/skills';
import { phase2HollowOf } from '../support/hollow-world';
import { armRun, send, toDesk } from '../map/repo-fixture';
import { WORKED_ROUTE } from '../map/run1-fixture';
import { createStore } from '@state/store';
import {
  sentryBootLineCount, sentrySeedBootText, firewallBootLineDue, firewallBootText, compileFirewall, preemptSeed, preemptArmed, sentryStatus,
  PREEMPT_THREAD_OWNER,
} from '@systems/sentry';
import { openBranchesAt } from '@systems/skill-tree';
import { visitNow } from '@systems/skill-levels';
import { deleteSec, actionDelete, setIntegrity } from '@state/actions';
import { getOps, threadsBusy, canStartOp, reserveThread, releaseThread } from '@systems/ops-core';
import { inSeedOutline } from '@systems/tool-targets';
import { seedsInMemory } from '@systems/hollow';
import { draftContext, dealDraft } from '@systems/draft';
import { draftEntries } from '@data/upgrades';
import { bootLinePlan } from '@data/script';
import { isDisguised } from '@state/threat-selectors';
import { isSkillFile } from '@state/selectors';
import { segmentStarts } from '@systems/memory-ops';
import { rackOf, layoutOf, hexAddr } from '@data/memory';
import { DISGUISE_POOL, SENTRY_TEXT, SEED_WORDS_MAX_CHARS } from '@data/threat-text';
import { TOOL_REFUSAL } from '@data/tool-text';
import { SKILL_TREE } from '@data/skills';
import {
  MAX_LINE_CHARS, SEG_NAME_MAX_CHARS, SEED_BLOCKS, ROOT_DELETE_SEC, FIREWALL_MAX_OWNED, SENTRY_DELETE_FACTOR,
  DELETE_HOLLOW_BASE_SEC, DELETE_HOLLOW_PER_BLOCK_SEC,
} from '@data/tuning';
import type { Segment, HollowSegment, SkillFileSegment } from '@/types/segment';
import type { GameState } from '@state/schema';

// --- The words, at their worst case (m6) --------------------------------------------------------------------------------
{
  const longestDecoy = DISGUISE_POOL.reduce((a, b) => (b.name.length > a.name.length ? b : a)).name;
  const longestFile = 'W'.repeat(SEG_NAME_MAX_CHARS);
  const words = 'w'.repeat(SEED_WORDS_MAX_CHARS);
  const lines = [
    SENTRY_TEXT.scanEcho(longestDecoy), SENTRY_TEXT.seedSays(words), SENTRY_TEXT.deleteEcho(longestDecoy, 99),
    SENTRY_TEXT.somethingNextTo(longestFile), SENTRY_TEXT.somethingNextToTab(longestFile), SENTRY_TEXT.bootSeed(longestDecoy, 'F'),
    SENTRY_TEXT.bootSeedGone(longestDecoy), SENTRY_TEXT.somethingLanded('F'), SENTRY_TEXT.preemptEcho('0x17F'),
    SENTRY_TEXT.firewallCompiled, SENTRY_TEXT.firewallNoRoom, SENTRY_TEXT.status.sight(3), SENTRY_TEXT.status.quickRm(1),
    SENTRY_TEXT.status.firewall(2), SENTRY_TEXT.opEcho('copy', longestDecoy), TOOL_REFUSAL.preemptArmed,
  ];
  const over = lines.filter((line) => line.length > MAX_LINE_CHARS);
  check(`every SENTRY and decoy line fits one row (≤ ${MAX_LINE_CHARS}) with the worst-case names`, over.length === 0,
    over.join(' | ') || `longest ${Math.max(...lines.map((line) => line.length))}`);
  check('…the strip\'s line keeps its hint with a real file name (66 with NAV PLOTTER\'s neighbour SENSOR INTERP)',
    SENTRY_TEXT.somethingNextTo('Sensor Interp').endsWith('SCAN its neighbours') && SENTRY_TEXT.somethingNextTo(longestFile).endsWith('— SCAN'),
    `${SENTRY_TEXT.somethingNextTo('Sensor Interp').length} chars`);
  check('…and none names HOLLOW', !lines.some((line) => /\bHOLLOW\b/.test(line)));
  check('every decoy is a short harmless name with its own line', DISGUISE_POOL.every((d) => d.name.length <= SEG_NAME_MAX_CHARS
    && d.desc.endsWith('No flight effect.')) && new Set(DISGUISE_POOL.map((d) => d.name)).size === DISGUISE_POOL.length);
}

// --- QUICK RM by the numbers (03 §3.10; R10) ----------------------------------------------------------------------------
{
  const block = (size: number, extra: Partial<HollowSegment> = {}): HollowSegment => ({
    id: 'b', name: '???', type: 'hollow', size, root: false, locked: false, owner: '???', ...extra,
  });
  const seed = block(SEED_BLOCKS, { seed: true });
  const meal = block(6, { ate: 'Repair' });
  const root = block(10, { root: true });
  const times = [0, 1, 2, 3].map((v) => `v${v}: seed ${deleteSec(seed, v as 0).toFixed(1)} meal ${deleteSec(meal, v as 0).toFixed(1)} root ${deleteSec(root, v as 0)}`);
  check('QUICK RM halves DELETE on hollow blocks from v2 (a seed 2.0 → 1.0 s, a 6-block meal 4.0 → 2.0 s); the root\'s 12 s stays',
    deleteSec(seed, 1) === 2 && deleteSec(seed, 2) === 1 && deleteSec(seed, 3) === 1 && deleteSec(meal, 0) === 4 && deleteSec(meal, 2) === 2
    && deleteSec(root, 3) === ROOT_DELETE_SEC && SENTRY_DELETE_FACTOR === 0.5
    && deleteSec(seed, 2) === (DELETE_HOLLOW_BASE_SEC + DELETE_HOLLOW_PER_BLOCK_SEC * SEED_BLOCKS) * SENTRY_DELETE_FACTOR, times.join(' | '));
  check('SENTRY is built to v3 (SIGHT, QUICK RM, FIREWALL)', SKILL_TREE.sentry.built === 3
    && SKILL_TREE.sentry.versions.map((v) => v.mode).join() === 'SIGHT,QUICK RM,FIREWALL');
}

// --- The opening (03 §3.2; R11) ------------------------------------------------------------------------------------------
{
  const store = armRun(3, 1);
  toDesk(store);
  const opened: string[] = [`visit ${visitNow(store.getState().run)}: ${openBranchesAt(store.getState(), 1).includes('sentry') ? 'SENTRY' : '-'}`];
  for (let i = 1; i < 4; i++) {
    send(store, WORKED_ROUTE[i]!);
    store.update((draft) => { draft.run.phase = 'report'; });
    toDesk(store);
    const state = store.getState();
    opened.push(`visit ${visitNow(state.run)}: ${openBranchesAt(state, visitNow(state.run)).includes('sentry') ? 'SENTRY' : '-'}`);
    if (i === 2) {
      // The same desk 3 on a run that met no seed yet (the record still null) keeps the branch shut; met at depth 4, it opens
      // at visit 4.
      const unseeded: GameState = structuredClone(state);
      unseeded.run.threat.seedsMetAtDepth = null;
      unseeded.run.skills.opened = [];
      const shut = !openBranchesAt(unseeded, 3).includes('sentry');
      unseeded.run.threat.seedsMetAtDepth = 4;
      unseeded.run.ships.push(structuredClone(unseeded.run.ships[unseeded.run.ships.length - 1]!));
      const tie = openBranchesAt(unseeded, 4);
      unseeded.run.skills.opened.push({ skill: 'survey', visit: 4 });
      check('…a record written at depth 4 opens it at visit 4, or at visit 5 when SURVEY takes visit 4 (R16)',
        shut && (tie.includes('sentry') || (tie.includes('survey') && openBranchesAt(unseeded, 5).includes('sentry'))));
    }
  }
  check('the DEFENCE branch opens at visit 3 on the worked route (after KESTREL\'s beam seeds), not before', opened.join(', ')
    === 'visit 1: -, visit 2: -, visit 3: SENTRY, visit 4: SENTRY', opened.join(', '));
}

// --- One store: the tutorial run's beam into KESTREL, its seed a decoy, SENTRY v3 aboard --------------------------------
const h = createHarness7(3, { soulsFound: true });
const s = (): Readonly<GameState> => h.store.getState();
const decoyDef = DISGUISE_POOL[2]!;
const sentryFile = (): SkillFileSegment => s().memory.find((seg): seg is SkillFileSegment => isSkillFile(seg) && seg.upgrade === 'sentry')!;
const setSentry = (integrity: number): void => h.store.update((draft) => {
  const file = draft.memory.find((seg): seg is SkillFileSegment => isSkillFile(seg) && seg.upgrade === 'sentry')!;
  setIntegrity(file, integrity);
  draft.ui.memoryRev++;
});

h.shipAlone(1, 3);
lockOn(h);
if (!h.untilPhase('report', 120)) throw new Error(`HALCYON never reached its report (${s().run.phase})`);
continueAfterReport(h.store);
h.transmit();
let seedId = '';
h.store.update((draft) => {
  const arrived = draft.run.arrival!.seeds[0]!;
  arrived.disguise = decoyDef.name;
  seedId = arrived.segId;
  const seg = draft.memory.find((candidate) => candidate.id === arrived.segId) as HollowSegment;
  seg.disguise = { name: decoyDef.name, desc: decoyDef.desc, seen: null };
});
giveSkillFile(h.store, 'sentry', 3);
{
  const plan = bootLinePlan(s(), 0);
  check('the boot plans one SENTRY seed line (after the ECC line, no seeds line: its one seed hides) and the FIREWALL line after the charge',
    sentryBootLineCount(s()) === 1 && firewallBootLineDue(s()) && !plan.includes('seeds')
    && plan.indexOf('sentry-seed') === plan.indexOf('ecc') + 1 && plan.indexOf('firewall') === plan.indexOf('charge') + 1, plan.join(' '));
}
const expectSeedLine = sentrySeedBootText(s(), 0);
h.events.length = 0;
h.untilPhase('flight', 60);
{
  const seg = s().memory.find((candidate) => candidate.id === seedId) as HollowSegment | undefined;
  const at = s().memory.findIndex((candidate) => candidate.id === seedId);
  const rack = rackOf(segmentStarts(s().memory)[at]!, layoutOf(s()));
  const landed = h.events.filter((event) => event.name === 'seed-landed-beam').map((event) => event.payload as { segId: string; targetId: string | null });
  const unmasked = h.events.filter((event) => event.name === 'seed-unmasked').map((event) => event.payload as { by: string });
  check(`v1 SIGHT at the boot: \`${expectSeedLine}\``, expectSeedLine === SENTRY_TEXT.bootSeed(decoyDef.name, rack)
    && s().log.entries.some((entry) => entry.text === expectSeedLine));
  check('…the decoy is unmasked by SENTRY, lands with the ECC line\'s thunk next to Telemetry, and is a seed to the strip now',
    seg?.disguise?.seen === 'sentry' && !isDisguised(seg) && landed.length === 1 && landed[0]!.segId === seedId
    && s().memory.find((candidate) => candidate.id === landed[0]!.targetId)?.role === 'telemetry'
    && unmasked.length === 1 && unmasked[0]!.by === 'sentry' && seedsInMemory(s().memory).some((candidate) => candidate.id === seedId));
  const firewalls = s().memory.filter((candidate) => candidate.type === 'firewall');
  check(`v3 at the boot: \`${SENTRY_TEXT.firewallCompiled}\`, one FIREWALL.sys in memory, 'firewall-compiled'`,
    s().log.entries.some((entry) => entry.text === SENTRY_TEXT.firewallCompiled) && firewalls.length === 1
    && firewalls[0]!.desc === SENTRY_TEXT.firewallDesc && h.events.filter((event) => event.name === 'firewall-compiled').length === 1);
  check(`…the Skills row: \`${sentryStatus(s())?.text}\``, sentryStatus(s())?.text === SENTRY_TEXT.status.firewall(1));
}

// v2's QUICK RM in flight: the seed SENTRY named goes in 1.0 s.
h.store.update((draft) => {
  // KESTREL's PATH UNCERTAIN (its Sensor Interp) is fixed first, as a kid would.
  const sensor = draft.memory.find((seg) => seg.role === 'sensor');
  if (sensor && 'integrity' in sensor) setIntegrity(sensor, 100);
  draft.ui.memoryRev++;
});
{
  const startAi = s().clock.aiSec;
  const refusal = actionDelete(h.store, s().memory.find((seg) => seg.id === seedId)!);
  for (let i = 0; i < 200 && getOps().length > 0; i++) h.step();
  const took = s().clock.aiSec - startAi;
  check(`v2 QUICK RM: the seed goes in ${took.toFixed(2)} AI s (1.0)`, refusal === null && Math.abs(took - 1.0) < 0.1 && !s().memory.some((seg) => seg.id === seedId));
}

// --- HOLLOW's own seeds on this ship: the pre-empt, SOMETHING LANDED ------------------------------------------------------
function nextTelegraph(): boolean {
  h.store.update((draft) => {
    draft.hollow.cfg = phase2HollowOf(2);
    draft.hollow.cfg.spreadEverySec = null;
    draft.hollow.phase = 'awake';
    draft.hollow.seedInSec = 0;
    draft.hollow.seedMoments = Math.max(1, draft.hollow.seedMoments);
  });
  for (let i = 0; i < 20 && s().hollow.seedTelegraph === null; i++) h.step();
  return s().hollow.seedTelegraph !== null;
}
function untilLanded(): void {
  for (let i = 0; i < 80 && s().hollow.seedTelegraph !== null; i++) h.step();
  h.step();
}
const hollowSeeds = (): HollowSegment[] => s().memory.filter((seg): seg is HollowSegment => seg.type === 'hollow' && seg.seed === true && seg.beam !== true);

{
  check('a HOLLOW seed telegraphs (the SEEDS stage\'s outline)', nextTelegraph());
  const telegraph = s().hollow.seedTelegraph!;
  const free = s().memory.find((seg, index) => seg.type === 'free'
    && segmentStarts(s().memory)[index]! <= telegraph.startAddr && segmentStarts(s().memory)[index]! + seg.size >= telegraph.startAddr + telegraph.size)!;
  check('the outline target: a block inside the outline on its free run, not one beside it',
    inSeedOutline(s(), free, telegraph.startAddr) && inSeedOutline(s(), free, telegraph.startAddr + 1)
    && !inSeedOutline(s(), free, telegraph.startAddr + telegraph.size) && !inSeedOutline(s(), free, telegraph.startAddr - 1));
  const busy = threadsBusy();
  const landedBefore = s().hollow.seedsLanded;
  h.events.length = 0;
  const armed = preemptSeed(h.store);
  check('v2: DELETE on the outline arms the pre-empt and holds a thread from the click; again: ARMED',
    armed === null && s().hollow.seedTelegraph?.preempted === true && threadsBusy() === busy + 1 && preemptSeed(h.store) === 'armed'
    && h.events.some((event) => event.name === 'refused' && (event.payload as { reason: string }).reason === TOOL_REFUSAL.preemptArmed));
  const seedsBefore = hollowSeeds().length;
  untilLanded();
  check(`…as it lands it is freed: 'seed-preempted', \`${SENTRY_TEXT.preemptEcho(hexAddr(telegraph.startAddr))}\`, a DELETE counted, the thread back`,
    h.events.some((event) => event.name === 'seed-preempted') && hollowSeeds().length === seedsBefore
    && s().log.entries.some((entry) => entry.text === SENTRY_TEXT.preemptEcho(hexAddr(telegraph.startAddr)))
    && h.events.some((event) => event.name === 'op-done' && (event.payload as { kind: string }).kind === 'delete')
    && s().hollow.seedsLanded === landedBefore + 1 && threadsBusy() === busy && !h.events.some((event) => event.name === 'seed-landed'));
}
{
  check('a second seed telegraphs', nextTelegraph());
  const startAddr = s().hollow.seedTelegraph!.startAddr;
  h.events.length = 0;
  untilLanded();
  const line = SENTRY_TEXT.somethingLanded(rackOf(startAddr, layoutOf(s())));
  check(`v1: one left to land is reported with its rack: \`${line}\``, h.events.some((event) => event.name === 'seed-landed')
    && s().log.entries.some((entry) => entry.text === line));
}
{
  nextTelegraph();
  const busy = threadsBusy();
  preemptSeed(h.store);
  const armedAtV2 = preemptArmed(s());
  setSentry(30);
  // Review m8: the painter draws the outline armed only while QUICK RM still works (it is what frees the seed).
  check('…the outline reads armed at v2, and no longer once SENTRY falls below v2 (still `preempted`, the seed will land)',
    armedAtV2 && s().hollow.seedTelegraph?.preempted === true && !preemptArmed(s()));
  const seedsBefore = hollowSeeds().length;
  untilLanded();
  check('SENTRY falling below v2 before the landing (30%: works as v1): the armed seed lands as usual, and the thread comes back',
    hollowSeeds().length === seedsBefore + 1 && threadsBusy() === busy && !h.events.some((event) => event.name === 'seed-preempted'));
  check('…and at v1 the outline refuses DELETE (no QUICK RM)', nextTelegraph() && preemptSeed(h.store) === 'no-sentry');
  setSentry(100);
  preemptSeed(h.store);
  const held = threadsBusy();
  // THE DEAL's pause or the finale's reset calls the telegraph off (hollow.ts acceptDeal, finale.ts): the watcher releases.
  h.store.update((draft) => { draft.hollow.seedTelegraph = null; });
  h.step();
  check('a call-off (the telegraph cleared) hands the thread back at the next tick', threadsBusy() === held - 1);
}
{
  nextTelegraph();
  const dummies: string[] = [];
  for (let i = 0; canStartOp() && i < 16; i++) { const owner = `test-${i}`; reserveThread(owner); dummies.push(owner); }
  h.events.length = 0;
  const refusal = preemptSeed(h.store);
  check(`every thread busy: refused \`${TOOL_REFUSAL.threads}\` (counted as any full Core), nothing armed`, refusal === 'no-thread'
    && s().hollow.seedTelegraph?.preempted === false
    && h.events.some((event) => event.name === 'refused' && (event.payload as { reason: string }).reason === TOOL_REFUSAL.threads));
  dummies.forEach((owner) => releaseThread(owner));
  releaseThread(PREEMPT_THREAD_OWNER);
  untilLanded();
}

// --- v3 under damage, the cap, NO ROOM, the FIREWALL card ------------------------------------------------------------------
{
  setSentry(64);
  const seed: HollowSegment = { id: 'x', name: '???', type: 'hollow', size: SEED_BLOCKS, root: false, locked: false, owner: '???', seed: true };
  check('v3 at 64% works as v2: no FIREWALL at a boot, still the quick rm, and the Skills row says QUICK RM',
    !firewallBootLineDue(s()) && sentryStatus(s())?.text === SENTRY_TEXT.status.quickRm(1) && deleteSec(seed, 2) === 1, sentryStatus(s())?.text);
  setSentry(100);
  const capped = structuredClone(s()) as GameState;
  const fw = capped.memory.find((seg) => seg.type === 'firewall')!;
  const at = capped.memory.findIndex((seg) => seg.type === 'free' && seg.size >= 4);
  capped.memory.splice(at, 1, { ...fw, id: 'fw-2' }, { ...capped.memory[at]!, size: capped.memory[at]!.size - fw.size } as Segment);
  check(`the cap: with ${FIREWALL_MAX_OWNED} FIREWALL.sys aboard no line is due, and a compile writes nothing`,
    !firewallBootLineDue(capped) && compileFirewall(createStore<GameState>(capped)) === 'capped');
  const full = structuredClone(s()) as GameState;
  full.memory.forEach((seg) => { if (seg.type === 'free') seg.reservedBy = 999; });
  const fullStore = createStore<GameState>(full);
  const before = JSON.stringify(full.memory);
  check(`no room (no open free run of 2): \`${SENTRY_TEXT.firewallNoRoom}\`, and nothing is written`,
    firewallBootText(full) === SENTRY_TEXT.firewallNoRoom && compileFirewall(fullStore) === 'no-room' && JSON.stringify(fullStore.getState().memory) === before);

  const link = 120;
  const withV3 = draftContext(s(), link);
  const noSentry = structuredClone(s()) as GameState;
  noSentry.memory = noSentry.memory.filter((seg) => !(isSkillFile(seg) && seg.upgrade === 'sentry'));
  noSentry.memory.push({ id: 'pad', name: 'Free', type: 'free', size: sentryFile().size });
  const withoutCtx = draftContext(noSentry, link);
  check('the salvage\'s FIREWALL card is not dealt while SENTRY v3 works (filtered before the draws), and is without it',
    withV3.firewallCompiler === true && !draftEntries(withV3).some((entry) => entry.def.id === 'firewall')
    && withoutCtx.firewallCompiler === undefined && draftEntries(withoutCtx).some((entry) => entry.def.id === 'firewall'),
    `${withV3.firewallCompiler} ${draftEntries(withV3).map((e) => e.def.id).join(',')} / ${withoutCtx.firewallCompiler} ${draftEntries(withoutCtx).map((e) => e.def.id).join(',')} room ${withoutCtx.linkRoom} owned ${withoutCtx.owned.firewall}`);
  const atV1 = structuredClone(s()) as GameState;
  const v1File = atV1.memory.find((seg): seg is SkillFileSegment => isSkillFile(seg) && seg.upgrade === 'sentry')!;
  v1File.version = 1;
  check('…a deal without SENTRY v3 is the same deal (v1 aboard or no SENTRY at all)',
    JSON.stringify(dealDraft(noSentry, link)) === JSON.stringify(dealDraft(atV1, link)) && draftContext(atV1, link).firewallCompiler === undefined);
}

finish();
