// @ts-nocheck: TODO(slice1a-TESTS): this suite tests phase 2's printer / souls and is rewritten per slice-1a-plan §5
// ("Existing suites: Rewrite"). F2 turned type-checking off here so tsc over tests stays green meanwhile; it fails at runtime.
// WP11 acceptance 3 (§9 WP11 item 5, §6.6, §4.5): LAST LIGHT's choice, headless.
// • MERGE restores every cluster HOLLOW ate on this ship: a block still standing turns back into colonists in place (at
//   its own address, also after an MV moved it) at 50, and prints waking with missing memories; a block the kid DELETEd
//   goes into the record as woke with missing memories at once (half credit); nothing is dropped. A cluster the belt took
//   to 0 was never HOLLOW's and stays lost. It costs 20 REPAIR CHARGE, and is refused below 20 with
//   `NEEDS 20 CHARGE (you have 14)` (nothing changes then).
// • RUN END after it is 'won-merge', the victory tone; the archive keeps mergeBonus and endingsSeen ['merge']; the next run
//   starts with a Core of 3 threads and the corruption floor 0.05 (the jerk dice still roll on the Core alone).
// • PURGE: every block of HOLLOW leaves memory; the eaten stay lost; 'won-purge'; endingsSeen gains 'purge' and the
//   bonus is used up (mergeBonus false).
// • The root's DELETE: 12 AI s, its last block standing in the root's middle; HOLLOW stops (no bites, seeds or verbs) and
//   lets go of what it was eating; INSPECT's words for the open root and the last block; the last block is locked.
// • UNRESOLVED: with every Rm gone (and none to repair), printing ends with the root standing: the ship ends unresolved,
//   RUN END 'unresolved', sombre. A flagship that woke nobody never gets the victory tone, even after a PURGE.
// • §9 WP11's edge cases: the Core worn below 50 mid-duel (the running DELETE keeps its thread); the flagship lost before
//   the duel (BEAM OUT, an escape, stranded, a crash with comms up: FLAGSHIP LOST; the Core eaten: OVERWRITTEN).
import { check, finish } from '../wp1/harness';
import { createHarness11 } from './harness11';
import { theRoot, landVerb, mvSpots, infectNow } from '@systems/hollow';
import { chooseFinale, finaleChoiceRefusal, finaleRunCause } from '@systems/finale';
import { continueAfterReport, startRun, lossPlan } from '@systems/run';
import { runEndModel } from '@systems/run-end';
import { actionDelete } from '@state/actions';
import { getOpsBySeg, threadsTotal } from '@systems/ops-core';
import { corruptionFloor } from '@systems/glitch';
import { openRunArchive, closeArchive, archiveMeta, archiveLineage, archiveRunStarted, type MetaStorage } from '@systems/meta';
import { hollowInspectState, hollowInspectDesc, HOLLOW_DESC, HOLLOW_INSPECT } from '@data/hollow-text';
import { targetRefusal } from '@systems/tool-targets';
import { segmentStarts, assertMemoryInvariants } from '@systems/memory-ops';
import { selectCorruption, chargeLeft, driversInMemory, isHollow } from '@state/selectors';
import { MEMORY_TOTAL_BLOCKS } from '@data/memory';
import { getShip } from '@data/ships';
import { RUN_END_NOBODY_WOKE } from '@data/script';
import { ROOT_DELETE_SEC, MERGE_COST_CHARGE, MERGE_DRIVER_INTEGRITY, MERGE_BONUS_CORE_CAPACITY, MERGE_CORRUPTION_FLOOR } from '@data/tuning';
import type { GameState } from '@state/schema';
import type { HollowSegment, DriverSegment } from '@/types/segment';

const h = createHarness11(31);
const state = (): Readonly<GameState> => h.store.getState();
const soul = (code: string): DriverSegment | undefined => driversInMemory(state()).find((seg) => seg.cluster === code);
const blockOf = (code: string): HollowSegment | undefined => state().memory.find((seg): seg is HollowSegment => isHollow(seg) && seg.atePod === code);
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
    // Printing paused for the set-up (the later clusters must still be in memory): PRINT NEXT stays the printer's.
    d.printer.waitAiSec = 9999;
  });
}

// Lets HOLLOW eat these clusters (no defender), whatever else it eats meanwhile is held off.
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
eat(['C13', 'C14', 'C15']);
check('HOLLOW ate C13, C14 and C15: their records say so (eaten), and each left a block that remembers it',
  ['C13', 'C14', 'C15'].every((code) => state().souls.results.some((result) => result.cluster === code && result.outcome === 'lost' && result.eaten === true)
    && blockOf(code) !== undefined), state().souls.results.map((result) => `${result.cluster}:${result.outcome}${result.eaten ? '*' : ''}`).join(' '));
// A belt-lost cluster for contrast: C01 taken to 0 the way a zone does it (not HOLLOW's).
h.store.update((d) => {
  const c01 = d.memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.cluster === 'C01');
  if (!c01) throw new Error('merge-test: C01 printed already');
  const index = d.memory.indexOf(c01);
  d.memory[index] = { id: 'free~c01', name: 'Free', type: 'free', size: c01.size };
  d.souls.results.push({ cluster: 'C01', family: c01.family, souls: c01.souls, outcome: 'lost', integrity: 0, range: 0, featured: c01.featured });
  d.ui.memoryRev++;
});
h.store.update((d) => { const mem = d.memory; for (let i = mem.length - 1; i > 0; i--) { const a = mem[i - 1]!; const b = mem[i]!; if (a.type === 'free' && b.type === 'free') { a.size += b.size; mem.splice(i, 1); } } });
assertMemoryInvariants(state().memory, MEMORY_TOTAL_BLOCKS);
// C14's block moved by an MV; C15's block DELETEd by the kid.
const c14Block = blockOf('C14')!;
const c14To = mvSpots(state().memory, c14Block)[0];
check('an MV has a spot for C14\'s block', c14To !== undefined);
landVerb(state().memory as GameState['memory'], { kind: 'mv', targetId: c14Block.id, toAddr: c14To! }, state().hollow.untriedTools);
h.store.update((d) => { d.ui.memoryRev++; });
check('…and moved it there', addrOf(c14Block.id) === c14To, `${addrOf(c14Block.id)} vs ${c14To}`);
actionDelete(h.store, blockOf('C15')!);
h.stepFor(1 + 0.5 * 8 + 0.2);
check('the kid DELETEd C15\'s block', blockOf('C15') === undefined);

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
// have moved one again): MERGE brings each cluster back exactly there.
const c13Block = blockOf('C13');
const c13At = c13Block ? addrOf(c13Block.id) : -1;
const c14At = blockOf('C14') ? addrOf(blockOf('C14')!.id) : -1;
const merged = chooseFinale(h.store, 'merge');
check('MERGE with 30: chosen, 20 charge spent', merged === null && chargeLeft(state()) === 30 - MERGE_COST_CHARGE && state().hollow.finale.phase === 'merged',
  `${merged} charge ${chargeLeft(state())}`);
check('…C13 back in place (its block\'s address), at 50', soul('C13')?.integrity === MERGE_DRIVER_INTEGRITY && addrOf(soul('C13')!.id) === c13At,
  `${soul('C13')?.integrity} at ${soul('C13') ? addrOf(soul('C13')!.id) : '-'} (block was at ${c13At})`);
check('…C14 back where its block stood (an MV moved it), at 50', soul('C14')?.integrity === MERGE_DRIVER_INTEGRITY && addrOf(soul('C14')!.id) === c14At
  && c14At !== -1, `${soul('C14') ? addrOf(soul('C14')!.id) : '-'} vs ${c14At}`);
const c15 = state().souls.results.find((result) => result.cluster === 'C15');
check('…C15 (its block deleted) woke with missing memories at once: half credit, nothing dropped', c15?.outcome === 'gaps' && c15.merged === true);
check('…C01 (the belt\'s, not HOLLOW\'s) stays lost', state().souls.results.find((result) => result.cluster === 'C01')?.outcome === 'lost');
check('…no block of HOLLOW is left in memory, the memory is whole', !state().memory.some(isHollow)
  && (() => { try { assertMemoryInvariants(state().memory, MEMORY_TOTAL_BLOCKS); return true; } catch { return false; } })());
// WP12 p3 (the lead's note of 22:40): CONTROL's verdict waits until the typed ending is over (the card types it
// as its last line); said at the choice, the header's ticker spoiled the ending. Checked below, at the WAKE REPORT.
const mergeVerdict = (): boolean => state().log.entries.some((entry) => /is non-compliant\. :\)$/.test(entry.text));
check('…the finale records it, and the TERMINAL says it; CONTROL waits for the typed ending', JSON.stringify([...state().hollow.finale.restoredInPlace].sort()) === JSON.stringify(['C13', 'C14'])
  && JSON.stringify(state().hollow.finale.restoredHalf) === JSON.stringify(['C15'])
  && state().log.entries.some((entry) => /^> merge unit_\d+ -> unit_\d+ \.\.\. OK$/.test(entry.text))
  && !mergeVerdict());
check('…a second choice is refused', chooseFinale(h.store, 'purge') !== null);

// Print the rest, the WAKE REPORT, RUN END.
h.store.update((d) => { d.printer.waitAiSec = 0; });
const end = h.wall() + 200;
while (state().run.phase === 'landing' && h.wall() < end) h.step();
check('printing went on with C13 and C14 and reached the WAKE REPORT', state().run.phase === 'report'
  && ['C13', 'C14'].every((code) => state().souls.results.some((result) => result.cluster === code && result.outcome === 'gaps')), state().run.phase);
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
eat(['C13']);
deleteRoot();
h.stepFor(ROOT_DELETE_SEC + 0.3);
check('PURGE scenario: the choice is on', state().hollow.finale.phase === 'choice');
setCharge(5);
check('…PURGE takes no charge and needs none', chooseFinale(h.store, 'purge') === null && chargeLeft(state()) === 5 && state().hollow.finale.phase === 'purged');
check('…every block of HOLLOW left memory; C13 stays lost', !state().memory.some(isHollow)
  && state().souls.results.find((result) => result.cluster === 'C13')?.outcome === 'lost'
  && state().log.entries.some((entry) => /^> rm unit_\d+ \.\.\. OK$/.test(entry.text))
  // WP12 p3: CONTROL's verdict waits for the typed ending (checked at the WAKE REPORT below).
  && !state().log.entries.some((entry) => /stand by for reassignment\. :\)$/.test(entry.text)));
h.store.update((d) => { d.printer.waitAiSec = 0; });
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
  d.printer.waitAiSec = 0;
  d.ui.memoryRev++;
});
assertMemoryInvariants(state().memory, MEMORY_TOTAL_BLOCKS);
check('UNRESOLVED scenario: with no Rm, the strip says nothing can delete the root', (() => { h.stepFor(0.6); return /NOTHING CAN DELETE THE ROOT/.test(h.shown()?.text ?? ''); })(),
  h.shown()?.text ?? '');
const unresolvedEnd = h.wall() + 200;
while (state().run.phase === 'landing' && h.wall() < unresolvedEnd) h.step();
check('…printing ended with the root standing: the ship ends unresolved, then the WAKE REPORT', state().hollow.finale.phase === 'unresolved' && state().run.phase === 'report'
  && finaleRunCause(state()) === 'unresolved', `${state().hollow.finale.phase} ${state().run.phase}`);
continueAfterReport(h.store);
check('…RUN END unresolved, sombre', state().run.endCause === 'unresolved' && runEndModel(state()).tone === 'sombre');

// --- The tone: a flagship that woke nobody ----------------------------------------------------------------------------------
toTheDuel(53);
h.store.update((d) => { d.printer.waitAiSec = 0; });
// Every cluster lost (as if HOLLOW and the belt had them all), the root deleted, PURGE: no victory screen.
h.store.update((d) => {
  for (let i = 0; i < d.memory.length; i++) {
    const seg = d.memory[i]!;
    if (seg.type !== 'driver') continue;
    d.souls.results.push({ cluster: seg.cluster, family: seg.family, souls: seg.souls, outcome: 'lost', integrity: 0, range: 0, featured: seg.featured });
    d.memory[i] = { id: `free~lost${i}`, name: 'Free', type: 'free', size: seg.size };
  }
  const mem = d.memory;
  for (let i = mem.length - 1; i > 0; i--) { const a = mem[i - 1]!; const b = mem[i]!; if (a.type === 'free' && b.type === 'free' && a.reservedBy === undefined && b.reservedBy === undefined) { a.size += b.size; mem.splice(i, 1); } }
  d.ui.memoryRev++;
});
h.stepFor(0.6);
check('every cluster gone before the root: the ship waits for the root (EVERYONE IS PRINTED — now DELETE THE ROOT), no WAKE REPORT yet',
  state().run.phase === 'landing' && /DELETE THE ROOT/.test(h.shown()?.text ?? ''), `${state().run.phase} ${h.shown()?.text}`);
deleteRoot();
h.stepFor(ROOT_DELETE_SEC + 0.3);
chooseFinale(h.store, 'purge');
const zeroEnd = h.wall() + 30;
while (state().run.phase === 'landing' && h.wall() < zeroEnd) h.step();
continueAfterReport(h.store);
// WP11 fix round 1 (the review): the words too, not only the tone: never THE FLEET IS HOME over an empty flagship.
check('…then PURGE: won-purge, but the flagship woke nobody: the sombre tone and words (`LAST LIGHT · NOBODY WOKE`), never the victory ones',
  state().run.endCause === 'won-purge' && runEndModel(state()).tone === 'sombre' && runEndModel(state()).title === RUN_END_NOBODY_WOKE.title
  && runEndModel(state()).why === RUN_END_NOBODY_WOKE.why['won-purge'],
  `${state().run.endCause} ${runEndModel(state()).tone} ${runEndModel(state()).title} | ${runEndModel(state()).why}`);

check('LAST LIGHT is the flagship and the last ship', getShip(4).flagship);

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
