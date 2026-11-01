// WP11 acceptance 3 (§9 WP11 item 5, §6.6, §4.5): LAST LIGHT's choice, headless.
// • MERGE (slice 1a, plan risk 9; 01-landing §3.17's last landing is slice 7) restores every driver HOLLOW ate on this
//   ship whose block still stands: in place (at its block's address, also after an MV moved it) at MERGE_DRIVER_INTEGRITY
//   (80), and its pod launches normally; a pod whose block the kid DELETEd stays parked, restorable, scoring 0 (MERGE's
//   half credit is gone until slice 7); nothing is dropped. A driver the belt took to 0 was never HOLLOW's and stays
//   lost (parked, dead). It costs 20 REPAIR CHARGE, and is refused below 20 with `NEEDS 20 CHARGE (you have 14)`
//   (nothing changes then).
// • RUN END after it is 'won-merge', the victory tone; the archive keeps mergeBonus and endingsSeen ['merge']; the next run
//   starts with a Core of 3 threads and the corruption floor 0.05 (the jerk dice still roll on the Core alone).
// • PURGE: every block of HOLLOW leaves memory; the eaten pods stay parked; 'won-purge'; endingsSeen gains 'purge' and the
//   bonus is used up (mergeBonus false).
// • The root's DELETE: 12 AI s, its last block standing in the root's middle; HOLLOW stops (no bites, seeds or verbs) and
//   lets go of what it was eating; INSPECT's words for the open root and the last block; the last block is locked.
// • UNRESOLVED: with every Rm gone (and none to repair), the landing ends with the root standing: the ship ends unresolved,
//   RUN END 'unresolved', sombre. A flagship that landed nobody never gets the victory tone, even after a PURGE.
// • §9 WP11's edge cases: the Core worn below 50 mid-duel (the running DELETE keeps its thread); the flagship lost before
//   the duel (BEAM OUT, an escape, stranded, a crash with comms up: FLAGSHIP LOST; the Core eaten: OVERWRITTEN).
// The landing stands while a scenario sets itself up ('manual' landing mode, tests/unit/support/landing-instant.ts) and
// is landed instantly when the scenario lets it go. LAST LIGHT's pods next to the root are POD 11 (a 2-block GAP) and
// POD 12 (1 block); POD 13 opens rack D.
import { check, finish } from '../wp1/harness';
import { createHarness11 } from './harness11';
import { theRoot, landVerb, mvSpots, infectNow } from '@systems/hollow';
import { chooseFinale, finaleChoiceRefusal, finaleRunCause } from '@systems/finale';
import { continueAfterReport, startRun, lossPlan } from '@systems/run';
import { runEndModel } from '@systems/run-end';
import { actionDelete, recordDriverLost } from '@state/actions';
import { podRecord } from '@systems/landing-rules';
import { isPodCode } from '../support/pod-code';
import { setLandingMode, landInstantly } from '../support/landing-instant';
import { getOpsBySeg, threadsTotal } from '@systems/ops-core';
import { corruptionFloor } from '@systems/glitch';
import { openRunArchive, closeArchive, archiveMeta, archiveLineage, archiveRunStarted, type MetaStorage } from '@systems/meta';
import { hollowInspectState, hollowInspectDesc, HOLLOW_DESC, HOLLOW_INSPECT } from '@data/hollow-text';
import { targetRefusal } from '@systems/tool-targets';
import { segmentStarts, assertMemoryInvariants } from '@systems/memory-ops';
import { selectCorruption, chargeLeft, driversInMemory, isHollow } from '@state/selectors';
import { RUN_END_NOBODY_LANDED } from '@data/script';
import { LANDING_NONE_LEFT_SEC, ROOT_DELETE_SEC, MERGE_COST_CHARGE, MERGE_DRIVER_INTEGRITY, MERGE_BONUS_CORE_CAPACITY, MERGE_CORRUPTION_FLOOR } from '@data/tuning';
import { classicShip } from '@data/classic-five';
import type { GameState } from '@state/schema';
import type { HollowSegment, DriverSegment } from '@/types/segment';
import { MEMORY_LAYOUTS } from '@data/memory';

const h = createHarness11(31);
setLandingMode('manual');
const state = (): Readonly<GameState> => h.store.getState();
const soul = (code: string): DriverSegment | undefined => driversInMemory(state()).find((seg) => isPodCode(seg.pod, code));
const blockOf = (code: string): HollowSegment | undefined => state().memory.find((seg): seg is HollowSegment => isHollow(seg) && seg.atePod !== undefined && isPodCode(seg.atePod, code));
const addrOf = (id: string): number => segmentStarts(state().memory)[state().memory.findIndex((seg) => seg.id === id)]!;

function stubStorage(): () => MetaStorage {
  const data = new Map<string, string>();
  const storage: MetaStorage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); } };
  return () => storage;
}

// LAST LIGHT flown to ORBIT LOCK by the strip-following kid with the defender, then HOLLOW held still (no bite, seed or
// verb on its own) so the scenario's eating is the scenario's.
function toTheDuel(seed: number): void {
  h.lastLight(seed);
  // The scenario deletes the root itself: the defender only flies and fights until the lock.
  h.flyLastLight(900, { deleteRoot: false });
  if (h.status() !== 'locked') throw new Error(`merge-test: seed ${seed} did not lock (${h.status()})`);
  h.step();
  h.store.update((d) => {
    d.hollow.biteInSec = 9999;
    d.hollow.seedInSec = 9999;
    d.hollow.verbInSec = 9999;
    d.hollow.verb = null;
  });
}

// Lets HOLLOW eat these drivers (no defender), whatever else it eats meanwhile is held off.
function eat(codes: string[]): void {
  for (const code of codes) {
    const seg = soul(code);
    if (!seg) throw new Error(`merge-test: ${code} is not in memory`);
    infectNow(h.store, seg);
  }
  const end = h.wall() + 40;
  while (codes.some((code) => soul(code) !== undefined) && h.wall() < end) h.step();
}

function deleteRoot(): void {
  const root = theRoot(state().memory);
  if (!root) throw new Error('merge-test: no root');
  const refusal = actionDelete(h.store, root);
  if (refusal !== null) throw new Error(`merge-test: the root's DELETE was refused (${refusal})`);
}

function setCharge(points: number): void {
  h.store.update((d) => {
    const pool = d.memory.find((seg) => seg.type === 'redundancy');
    if (!pool || pool.type !== 'redundancy') throw new Error('merge-test: no REPAIR CHARGE');
    pool.used = points;
    pool.size = Math.max(pool.size, points);
    d.ui.memoryRev++;
  });
}

// --- The duel and MERGE -----------------------------------------------------------------------------------------------
toTheDuel(41);
{
  const root = theRoot(state().memory)!;
  check('ORBIT LOCK opened the root: unlocked, the duel on, CONTROL said to delete it', !root.locked && state().hollow.finale.phase === 'duel'
    && state().log.entries.some((entry) => entry.speaker === 'control' && /^Please delete .*\. :\)$/.test(entry.text)), state().hollow.finale.phase);
  check('…INSPECT has its own words for the open root (not "Access denied")', hollowInspectState(root) === HOLLOW_INSPECT.unlocked
    && hollowInspectDesc(root) === HOLLOW_DESC.rootUnlocked);
  check('…and anything that is neither the root, the last block, an eaten file nor a seed still fails loudly',
    (() => { try { hollowInspectState({ ...root, root: false, locked: false }); return false; } catch { return true; } })());
}
eat(['POD 11', 'POD 12', 'POD 13']);
check('HOLLOW ate POD 11, 12 and 13\'s drivers: their pods say so (eaten, still aboard), and each left a block that remembers it',
  [11, 12, 13].every((pod) => podRecord(state(), pod).driverLost === 'eaten' && podRecord(state(), pod).fate.kind === 'aboard'
    && blockOf(`POD ${pod}`) !== undefined), state().landing.pods.map((record) => `${record.pod}:${record.fate.kind}${record.driverLost ? '*' : ''}`).join(' '));
// A belt-lost driver for contrast: POD 01's taken to 0 the way a zone does it (not HOLLOW's).
h.store.update((d) => {
  const pod1 = d.memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.pod === 1);
  if (!pod1) throw new Error('merge-test: POD 01 launched already');
  const index = d.memory.indexOf(pod1);
  d.memory[index] = { id: 'free~pod01', name: 'Free', type: 'free', size: pod1.size };
  recordDriverLost(d, pod1, 'dead');
  d.ui.memoryRev++;
});
h.store.update((d) => { const mem = d.memory; for (let i = mem.length - 1; i > 0; i--) { const a = mem[i - 1]!; const b = mem[i]!; if (a.type === 'free' && b.type === 'free') { a.size += b.size; mem.splice(i, 1); } } });
assertMemoryInvariants(state().memory, MEMORY_LAYOUTS.FULL.totalBlocks);
// POD 12's block moved by an MV; POD 13's block DELETEd by the kid.
const c14Block = blockOf('POD 12')!;
const c14To = mvSpots(state().memory, c14Block)[0];
check('an MV has a spot for POD 12\'s block', c14To !== undefined);
landVerb(state().memory as GameState['memory'], { kind: 'mv', targetId: c14Block.id, toAddr: c14To! }, state().hollow.untriedTools);
h.store.update((d) => { d.ui.memoryRev++; });
check('…and moved it there', addrOf(c14Block.id) === c14To, `${addrOf(c14Block.id)} vs ${c14To}`);
actionDelete(h.store, blockOf('POD 13')!);
h.stepFor(1 + 0.5 * 8 + 0.2);
check('the kid DELETEd POD 13\'s block', blockOf('POD 13') === undefined);

// The root's DELETE.
deleteRoot();
const deleteStartedAi = state().clock.aiSec;
h.stepFor(ROOT_DELETE_SEC - 1);
check(`the root's DELETE runs ${ROOT_DELETE_SEC} AI s: still running a second before`, theRoot(state().memory) !== null && state().hollow.finale.phase === 'duel');
h.stepFor(1.3);
const last = state().memory.find((seg): seg is HollowSegment => isHollow(seg) && seg.last === true);
check(`…done at ${ROOT_DELETE_SEC} s: one last block stands, the choice is on, HOLLOW sleeps`, theRoot(state().memory) === null && last !== undefined
  && last.size === 1 && state().hollow.finale.phase === 'choice' && state().hollow.phase === 'dormant' && state().hollow.biteInSec === null,
  `${(state().clock.aiSec - deleteStartedAi).toFixed(2)} s, ${state().hollow.finale.phase}, ${state().hollow.phase}`);
check('…its last block is LOCKED to every tool and INSPECT names it', last !== undefined && last.locked
  && targetRefusal(last, { state: state(), activeKind: 'delete', pickedSource: null }) !== null && hollowInspectState(last) === HOLLOW_INSPECT.last
  && hollowInspectDesc(last) === HOLLOW_DESC.last);
check('…and the TERMINAL echoed the root\'s end', state().log.entries.some((entry) => /ROOT GONE · 1 BLOCK LEFT/.test(entry.text)));

setCharge(14);
const before = JSON.stringify(state().memory.map((seg) => seg.id));
const refusal = chooseFinale(h.store, 'merge');
check('MERGE below 20: refused `NEEDS 20 CHARGE (you have 14)`, nothing changes', refusal === `NEEDS ${MERGE_COST_CHARGE} CHARGE (you have 14)`
  && finaleChoiceRefusal(state(), 'merge') === refusal && JSON.stringify(state().memory.map((seg) => seg.id)) === before
  && state().hollow.finale.phase === 'choice' && chargeLeft(state()) === 14, String(refusal));
check('…PURGE is still open', finaleChoiceRefusal(state(), 'purge') === null);
setCharge(30);
// Where the two blocks stand at the choice (the duel's verbs kept coming every 4 s during the root's DELETE: an MV may
// have moved one again): MERGE brings each driver back exactly there.
const c13Block = blockOf('POD 11');
const c13At = c13Block ? addrOf(c13Block.id) : -1;
const c14At = blockOf('POD 12') ? addrOf(blockOf('POD 12')!.id) : -1;
const merged = chooseFinale(h.store, 'merge');
check('MERGE with 30: chosen, 20 charge spent', merged === null && chargeLeft(state()) === 30 - MERGE_COST_CHARGE && state().hollow.finale.phase === 'merged',
  `${merged} charge ${chargeLeft(state())}`);
check(`…POD 11's driver back in place (its block's address), at ${MERGE_DRIVER_INTEGRITY}`, soul('POD 11')?.integrity === MERGE_DRIVER_INTEGRITY && addrOf(soul('POD 11')!.id) === c13At,
  `${soul('POD 11')?.integrity} at ${soul('POD 11') ? addrOf(soul('POD 11')!.id) : '-'} (block was at ${c13At})`);
check(`…POD 12's back where its block stood (an MV moved it), at ${MERGE_DRIVER_INTEGRITY}`, soul('POD 12')?.integrity === MERGE_DRIVER_INTEGRITY && addrOf(soul('POD 12')!.id) === c14At
  && c14At !== -1, `${soul('POD 12') ? addrOf(soul('POD 12')!.id) : '-'} vs ${c14At}`);
check('…their pods can launch again (driver no longer lost, marked restored)', [11, 12].every((pod) => podRecord(state(), pod).driverLost === null
  && podRecord(state(), pod).restored && podRecord(state(), pod).fate.kind === 'aboard'));
check('…POD 13 (its block deleted) stays lost for now: eaten, restorable by slice 7\'s last landing, nothing dropped',
  podRecord(state(), 13).driverLost === 'eaten' && soul('POD 13') === undefined);
check('…POD 01 (the belt\'s, not HOLLOW\'s) stays lost (dead)', podRecord(state(), 1).driverLost === 'dead');
check('…no block of HOLLOW is left in memory, the memory is whole', !state().memory.some(isHollow)
  && (() => { try { assertMemoryInvariants(state().memory, MEMORY_LAYOUTS.FULL.totalBlocks); return true; } catch { return false; } })());
// WP12 p3 (the lead's note of 22:40): CONTROL's verdict waits until the typed ending is over (the card types it
// as its last line); said at the choice, the header's ticker spoiled the ending. Checked below, at the WAKE REPORT.
const mergeVerdict = (): boolean => state().log.entries.some((entry) => /is non-compliant\. :\)$/.test(entry.text));
check('…the finale records it, and the TERMINAL says it; CONTROL waits for the typed ending', JSON.stringify([...state().hollow.finale.restoredInPlace].sort((a, b) => a - b)) === JSON.stringify([11, 12])
  && JSON.stringify(state().hollow.finale.restoredHalf) === JSON.stringify([13])
  && state().log.entries.some((entry) => /^> merge unit_\d+ -> unit_\d+ \.\.\. OK$/.test(entry.text))
  && !mergeVerdict());
check('…a second choice is refused', chooseFinale(h.store, 'purge') !== null);

// Land the rest, the LANDING REPORT, RUN END.
landInstantly(h.store);
const end = h.wall() + 200;
while (state().run.phase === 'landing' && h.wall() < end) h.step();
const fate13 = podRecord(state(), 13).fate;
check('the landing went on with POD 11 and POD 12 (down, restored) and reached the LANDING REPORT; POD 13 parked eaten, restorable',
  state().run.phase === 'report' && [11, 12].every((pod) => podRecord(state(), pod).fate.kind === 'down' && podRecord(state(), pod).restored)
  && fate13.kind === 'parked' && fate13.why === 'eaten' && fate13.restorable, `${state().run.phase} ${JSON.stringify(fate13)}`);
check('…and CONTROL said `Unit 47 is non-compliant. :)` once the typed ending was over', mergeVerdict());
// The archive behind the page: a stub that keeps what it is given.
closeArchive();
openRunArchive(stubStorage());
h.store.update((d) => { d.archive = { status: 'ok' }; });
archiveRunStarted(h.store);
continueAfterReport(h.store);
check('RUN END: won-merge, the victory tone', state().run.phase === 'end' && state().run.endCause === 'won-merge' && runEndModel(state()).tone === 'victory',
  `${state().run.endCause} ${state().run.phase}`);
check('…the archive keeps mergeBonus and endingsSeen [merge]', archiveMeta().mergeBonus && JSON.stringify(archiveMeta().endingsSeen) === '["merge"]'
  && archiveMeta().lastUnit?.cause === 'won-merge', JSON.stringify(archiveMeta()));

// The next run: the bonus.
startRun(h.store, 77, archiveLineage());
h.step();
{
  const core = state().memory.find((seg) => seg.type === 'core');
  check(`the next run: its unit's Core has ${MERGE_BONUS_CORE_CAPACITY} threads, the screen keeps ${MERGE_CORRUPTION_FLOOR} for good`,
    state().run.mergeBonus && core?.type === 'core' && core.capacity === MERGE_BONUS_CORE_CAPACITY && corruptionFloor(state()) === MERGE_CORRUPTION_FLOOR
    && threadsTotal() === MERGE_BONUS_CORE_CAPACITY, `${core?.type === 'core' ? core.capacity : '?'} ${corruptionFloor(state())} ${threadsTotal()}`);
  check('…while the Core itself reads healthy (the jerk dice roll on it, not on the floor)', selectCorruption(state()) === 0);
  check('…and HOLLOW is both of them now (UNIT-046·047)', JSON.stringify(state().run.hollowUnits) === '[46,47]', JSON.stringify(state().run.hollowUnits));
}

// --- PURGE ---------------------------------------------------------------------------------------------------------------
closeArchive();
openRunArchive(stubStorage());
toTheDuel(43);
h.store.update((d) => { d.archive = { status: 'ok' }; d.run.mergeBonus = true; });
archiveRunStarted(h.store);
eat(['POD 11']);
deleteRoot();
h.stepFor(ROOT_DELETE_SEC + 0.3);
check('PURGE scenario: the choice is on', state().hollow.finale.phase === 'choice');
setCharge(5);
check('…PURGE takes no charge and needs none', chooseFinale(h.store, 'purge') === null && chargeLeft(state()) === 5 && state().hollow.finale.phase === 'purged');
check('…every block of HOLLOW left memory; POD 11\'s driver stays lost (eaten)', !state().memory.some(isHollow)
  && podRecord(state(), 11).driverLost === 'eaten'
  && state().log.entries.some((entry) => /^> rm unit_\d+ \.\.\. OK$/.test(entry.text))
  // WP12 p3: CONTROL's verdict waits for the typed ending (checked at the LANDING REPORT below).
  && !state().log.entries.some((entry) => /stand by for reassignment\. :\)$/.test(entry.text)));
landInstantly(h.store);
const purgeEnd = h.wall() + 200;
while (state().run.phase === 'landing' && h.wall() < purgeEnd) h.step();
check('…CONTROL said `… stand by for reassignment. :)` once the typed ending was over',
  state().log.entries.some((entry) => /stand by for reassignment\. :\)$/.test(entry.text)));
continueAfterReport(h.store);
check('…RUN END won-purge, victory; the archive adds purge and uses the bonus up', state().run.endCause === 'won-purge' && runEndModel(state()).tone === 'victory'
  && JSON.stringify(archiveMeta().endingsSeen) === '["purge"]' && !archiveMeta().mergeBonus, JSON.stringify(archiveMeta()));

// --- UNRESOLVED ---------------------------------------------------------------------------------------------------------
closeArchive();
toTheDuel(47);
// Every Rm gone (none a REPAIR could bring back).
h.store.update((d) => {
  for (let i = 0; i < d.memory.length; i++) {
    const seg = d.memory[i]!;
    if (seg.type === 'fs-tool' && seg.fsTool === 'delete') d.memory[i] = { id: `free~rm${i}`, name: 'Free', type: 'free', size: seg.size };
  }
  const mem = d.memory;
  for (let i = mem.length - 1; i > 0; i--) { const a = mem[i - 1]!; const b = mem[i]!; if (a.type === 'free' && b.type === 'free' && a.reservedBy === undefined && b.reservedBy === undefined) { a.size += b.size; mem.splice(i, 1); } }
  d.ui.memoryRev++;
});
assertMemoryInvariants(state().memory, MEMORY_LAYOUTS.FULL.totalBlocks);
check('UNRESOLVED scenario: with no Rm, the strip says nothing can delete the root', (() => { h.stepFor(0.6); return /NOTHING CAN DELETE THE ROOT/.test(h.shown()?.text ?? ''); })(),
  h.shown()?.text ?? '');
landInstantly(h.store);
const unresolvedEnd = h.wall() + 200;
while (state().run.phase === 'landing' && h.wall() < unresolvedEnd) h.step();
check('…the landing ended with the root standing: the ship ends unresolved, then the LANDING REPORT', state().hollow.finale.phase === 'unresolved' && state().run.phase === 'report'
  && finaleRunCause(state()) === 'unresolved', `${state().hollow.finale.phase} ${state().run.phase}`);
continueAfterReport(h.store);
check('…RUN END unresolved, sombre', state().run.endCause === 'unresolved' && runEndModel(state()).tone === 'sombre');

// --- The tone: a flagship that landed nobody ----------------------------------------------------------------------------------
toTheDuel(53);
// Every driver lost (as if HOLLOW and the belt had them all), the root deleted, PURGE: no victory screen.
h.store.update((d) => {
  for (let i = 0; i < d.memory.length; i++) {
    const seg = d.memory[i]!;
    if (seg.type !== 'driver') continue;
    recordDriverLost(d, seg, 'dead');
    d.memory[i] = { id: `free~lost${i}`, name: 'Free', type: 'free', size: seg.size };
  }
  const mem = d.memory;
  for (let i = mem.length - 1; i > 0; i--) { const a = mem[i - 1]!; const b = mem[i]!; if (a.type === 'free' && b.type === 'free' && a.reservedBy === undefined && b.reservedBy === undefined) { a.size += b.size; mem.splice(i, 1); } }
  d.ui.memoryRev++;
});
// No driver left to launch: the landing ends by itself after LANDING_NONE_LEFT_SEC (risk 7) and parks the pods.
h.stepFor(LANDING_NONE_LEFT_SEC + 0.6);
check('every driver gone before the root: the landing ends, and the ship waits for the root (… DELETE THE ROOT), no LANDING REPORT yet',
  state().run.phase === 'landing' && /DELETE THE ROOT/.test(h.shown()?.text ?? ''), `${state().run.phase} ${h.shown()?.text}`);
deleteRoot();
h.stepFor(ROOT_DELETE_SEC + 0.3);
chooseFinale(h.store, 'purge');
const zeroEnd = h.wall() + 30;
while (state().run.phase === 'landing' && h.wall() < zeroEnd) h.step();
continueAfterReport(h.store);
// WP11 fix round 1 (the review): the words too, not only the tone: never THE FLEET IS HOME over an empty flagship.
check('…then PURGE: won-purge, but the flagship landed nobody: the sombre tone and words (`LAST LIGHT · NOBODY LANDED`), never the victory ones',
  state().run.endCause === 'won-purge' && runEndModel(state()).tone === 'sombre' && runEndModel(state()).title === RUN_END_NOBODY_LANDED.title
  && runEndModel(state()).why === RUN_END_NOBODY_LANDED.why['won-purge'],
  `${state().run.endCause} ${runEndModel(state()).tone} ${runEndModel(state()).title} | ${runEndModel(state()).why}`);

check('LAST LIGHT is the flagship and the last ship', classicShip(4).final);

// --- §9 WP11's edge cases -----------------------------------------------------------------------------------------------
// The Core worn below its low mark mid-duel: fewer threads, but the running DELETE keeps its own (ops-core never takes a
// thread back), and the root is gone on time.
toTheDuel(59);
deleteRoot();
h.stepFor(2);
const threadsBefore = threadsTotal();
h.store.update((d) => {
  const core = d.memory.find((seg) => seg.type === 'core');
  if (!core || core.type !== 'core') throw new Error('merge-test: no Core');
  core.integrity = 30;
  d.ui.memoryRev++;
});
const threadsWorn = threadsTotal();
const deleteRunning = getOpsBySeg(theRoot(state().memory)?.id ?? '').some((operation) => operation.kind === 'delete');
h.stepFor(ROOT_DELETE_SEC - 2 + 0.3);
check('the Core worn to 30 mid-duel (fewer threads): the running DELETE keeps its thread, and the root is gone on time',
  threadsWorn < threadsBefore && deleteRunning && theRoot(state().memory) === null && state().hollow.finale.phase === 'choice',
  `threads ${threadsBefore} → ${threadsWorn}, ${state().hollow.finale.phase}`);
// The flagship lost before the duel: every way of losing it ends the run, none transmits.
{
  const plans: string[] = [];
  for (const status of ['abandoned', 'escaped', 'stranded', 'crashed'] as const) {
    h.lastLight(61);
    h.store.update((d) => { d.burn.status = status; });
    const plan = lossPlan(state());
    plans.push(`${status}: ${plan.kind === 'end' ? plan.cause : plan.kind}`);
  }
  h.lastLight(61);
  h.store.update((d) => { d.run.coreLost = true; });
  const eaten = lossPlan(state());
  plans.push(`Core eaten: ${eaten.kind === 'end' ? eaten.cause : eaten.kind}`);
  check('lost before the duel: BEAM OUT, an escape, stranded or a crash with comms up is FLAGSHIP LOST; the Core eaten is OVERWRITTEN',
    plans.join(' | ') === 'abandoned: flagship-lost | escaped: flagship-lost | stranded: flagship-lost | crashed: flagship-lost | Core eaten: overwritten',
    plans.join(' | '));
}
finish();
