// Slice 7b, Track DROP: THE LAST LANDING (01-landing §3.17; slice-7-plan R24–R29), headless. Was wp11/merge-test (WP11
// acceptance 3: LAST LIGHT's choice), which plan §4.4 turns into this suite; its PURGE, UNRESOLVED and edge cases stay.
// • The classic LAST LIGHT: HOLLOW eats POD 11, 12 and 13 (an MV moves POD 12's block, the kid DELETEs POD 13's) and the belt
//   kills POD 01's driver. The root's DELETE (12 AI s, its last block locked, HOLLOW asleep: R6), the card once the landing
//   settles, MERGE refused below MERGE_COST_CHARGE (16; `NEEDS 16 CHARGE · you have 14`), then MERGE: every block of HOLLOW leaves
//   memory and the three eaten drivers come back by radio at MERGE_DRIVER_INTEGRITY, never in memory (R24), whatever became
//   of their blocks (R25); POD 01 stays parked. THE LAST LANDING starts (its words, 'last-landing-start', the SHIP view and
//   the 'last-landing' layer: R26), flies blind (the classic unit holds no AUTODROP), ends with the machine cleared and
//   'done' in one update, then the LANDING REPORT's RESTORED BY MERGE row (R29), RUN END 'won-merge', the archive's pieces.
// • PURGE, UNRESOLVED (IT FOLLOWED YOU), the flagship that landed nobody, the Core worn mid-duel, the flagship lost before the
//   duel: WP11's, under 7a's two steps.
// • The arm's LAST LIGHT (last-landing-arm.ts): v3 on a healthy orbit lands all 6 soft in LZs with room, within its two
//   orbits, at the cadence, memory untouched, ★ ON TARGET's denominator; [ENTER] gives the same landing in one keypress
//   (R28); v1 one pod per window in pass order, each in its sure part; blind ×2 spread within ±(W/2 + 150 km), one pod per
//   window (its worth on 20 draws at full depth), its moments uniform; v2's pass armed on AUTODROP's own fields and at rest
//   after, on its own pass (the kid's AUTODROP machine never written, its [−]/[+] and [G] shut); the two-orbit limit (a pod
//   AUTODROP can't place drops blind after it); no drop solution (Nav Plotter dead: blind on the plotter-free geometry), the
//   plotter lost mid-landing (blind from there), Bay Ctrl missing (nothing ends early), the ship lost mid-landing (7b review). Landing points for every flier by planet class: ending/last-landing-sweep (BALANCE_ONLY).
// The landing stands while a scenario sets itself up ('manual' landing mode, tests/unit/support/landing-instant.ts).
import { check, finish } from '../wp1/harness';
import { createHarness11 } from '../wp11/harness11';
import { theRoot, landVerb, mvSpots, infectNow } from '@systems/hollow';
import { pickStep1, pickStep2, continueFollowed, skipFinaleEnding } from '@systems/finale';
import { finaleRunCause, optionState } from '@systems/ending-rules';
import { FINALE_TEXT } from '@data/finale-text';
import { startRun, lossPlan } from '@systems/run';
import { continueAfterReport } from '../support/desk';
import { runEndModel } from '@systems/run-end';
import { actionDelete, recordDriverLost } from '@state/actions';
import { podRecord, landingView, launchRefusal, onTargetTally, landingStuck } from '@systems/landing-rules';
import { isPodCode } from '../support/pod-code';
import { setLandingMode, landInstantly } from '../support/landing-instant';
import { getOpsBySeg, threadsTotal } from '@systems/ops-core';
import { openRunArchive, closeArchive, archiveMeta, archiveLineage, archiveRunStarted, type MetaStorage } from '@systems/meta';
import { hollowInspectState, hollowInspectDesc, HOLLOW_DESC, HOLLOW_INSPECT } from '@data/hollow-text';
import { targetRefusal } from '@systems/tool-targets';
import { segmentStarts, assertMemoryInvariants, mergeAdjacentFree } from '@systems/memory-ops';
import { selectCorruption, chargeLeft, driversInMemory, isHollow } from '@state/selectors';
import { RUN_END_NOBODY_LANDED } from '@data/script';
import {
  BLIND_DROP_MULT, BLIND_MARGIN_KM, LANDING_NONE_LEFT_SEC, LAST_LANDING_AUTODROP_ORBITS, LAST_LANDING_CADENCE_SEC, MERGE_COST_CHARGE,
  MERGE_DRIVER_INTEGRITY, ROOT_DELETE_SEC,
} from '@data/tuning';
import { LAST_LANDING_TEXT } from '@data/last-landing-text';
import { landingReportModel } from '@systems/landing-report';
import { setMode } from '@systems/mode';
import { activeLayer } from '@systems/input';
import { fixtureShip } from '../support/arm-ship';
import type { GameState } from '@state/schema';
import type { HollowSegment, DriverSegment } from '@/types/segment';
import { MEMORY_LAYOUTS } from '@data/memory';
import { toTheDuel } from '../wp11/duel';
import { chooseEnding, finaleAtStep1, decidedAs, settleFinale } from '../support/finale';
import { byDepth, fullOnly } from '../depth';
import { skipLastLanding, nextTurn } from '@systems/last-landing';
import { getDropSolution } from '@systems/drop-cache';
import { activeLandingController } from '@systems/landing-controller';
import { playerLaunch } from '@systems/landing-controls';
import { requestLaunch } from '@systems/landing';
import { bayWindowModel } from '@systems/landing-hud';
import { capabilitiesNow } from '@systems/capabilities';
import { LAUNCH_REFUSAL_TEXT, launchRefusalKey } from '@data/landing-text';
import { windowsAhead, planLanding } from '@systems/autodrop-plan';
import { pressAutodrop, setPassCount } from '@systems/autodrop';
import { endLandingLost } from '@systems/orbit-sim';
import { lastLandingHeader } from '@systems/last-landing-hud';
import type { LaunchRecord } from '@/types/landing';
import {
  armLastLanding as arm, deleteRoot as deleteRootOf, dotFromCentreKm as armDotFromCentreKm, launchOf as armLaunchOf, normalS as armNormalS, type ArmOpts,
} from './last-landing-arm';


const h = createHarness11(31);
setLandingMode('manual');
const state = (): Readonly<GameState> => h.store.getState();
const soul = (code: string): DriverSegment | undefined => driversInMemory(state()).find((seg) => isPodCode(seg.pod, code));
const blockOf = (code: string): HollowSegment | undefined => state().memory.find((seg): seg is HollowSegment => isHollow(seg) && seg.atePod !== undefined && isPodCode(seg.atePod, code));
const addrOf = (id: string): number => segmentStarts(state().memory)[state().memory.findIndex((seg) => seg.id === id)]!;
// The segment covering block `addr`.
const segmentAt = (addr: number): Readonly<GameState['memory'][number]> | undefined => {
  const starts = segmentStarts(state().memory);
  return state().memory.find((seg, i) => starts[i]! <= addr && addr < starts[i]! + seg.size);
};

function stubStorage(): () => MetaStorage {
  const data = new Map<string, string>();
  const storage: MetaStorage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); } };
  return () => storage;
}


// Lets HOLLOW eat these drivers (no defender), whatever else it eats meanwhile is held off.
function eat(codes: string[]): void {
  for (const code of codes) {
    const seg = soul(code);
    if (!seg) throw new Error(`last-landing: ${code} is not in memory`);
    infectNow(h.store, seg);
  }
  const end = h.wall() + 40;
  while (codes.some((code) => soul(code) !== undefined) && h.wall() < end) h.step();
}

const deleteRoot = (): void => deleteRootOf(h);

function setCharge(points: number): void {
  h.store.update((d) => {
    const pool = d.memory.find((seg) => seg.type === 'redundancy');
    if (!pool || pool.type !== 'redundancy') throw new Error('last-landing: no REPAIR CHARGE');
    pool.used = points;
    pool.size = Math.max(pool.size, points);
    d.ui.memoryRev++;
  });
}

// --- The duel and MERGE -----------------------------------------------------------------------------------------------
toTheDuel(h);
{
  const root = theRoot(state().memory)!;
  check('ORBIT LOCK opened the root: unlocked, the duel on, CONTROL said to delete it', !root.locked && state().hollow.finale.phase === 'duel'
    && state().log.entries.some((entry) => entry.speaker === 'control' && /^Delete .*\.$/.test(entry.text)), state().hollow.finale.phase);
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
  if (!pod1) throw new Error('last-landing: POD 01 launched already');
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
check(`…done at ${ROOT_DELETE_SEC} s: one last block stands, HOLLOW sleeps and asks for the landing first (R6)`, theRoot(state().memory) === null && last !== undefined
  && last.size === 1 && state().hollow.finale.phase === 'asleep' && state().hollow.finale.rootFell && state().hollow.phase === 'dormant'
  && state().hollow.biteInSec === null && state().log.entries.some((entry) => entry.text === FINALE_TEXT.asleep('047')),
  `${(state().clock.aiSec - deleteStartedAi).toFixed(2)} s, ${state().hollow.finale.phase}, ${state().hollow.phase}`);
check('…its last block is LOCKED to every tool and INSPECT names it', last !== undefined && last.locked
  && targetRefusal(last, { state: state(), activeKind: 'delete', pickedSource: null }) !== null && hollowInspectState(last) === HOLLOW_INSPECT.last
  && hollowInspectDesc(last) === HOLLOW_DESC.last);
check('…and the TERMINAL echoed the root\'s end', state().log.entries.some((entry) => /ROOT GONE · 1 BLOCK LEFT/.test(entry.text)));
// END LANDING (the eaten pods park, restorable), and the card comes up.
settleFinale(h.store, () => h.step());
check('…the landing settled: the card\'s step 1 is up', finaleAtStep1(state()) && state().landing.ended !== null, state().hollow.finale.phase);

setCharge(14);
const before = JSON.stringify(state().memory.map((seg) => seg.id));
const refusal = chooseEnding(h.store, 'merge');
check(`MERGE below ${MERGE_COST_CHARGE}: refused \`NEEDS ${MERGE_COST_CHARGE} CHARGE · you have 14\`, nothing changes`, refusal === `NEEDS ${MERGE_COST_CHARGE} CHARGE · you have 14`
  && optionState(state(), 'merge', []).kind === 'needs' && JSON.stringify(state().memory.map((seg) => seg.id)) === before
  && finaleAtStep1(state()) && chargeLeft(state()) === 14, String(refusal));
check('…PURGE is still open', optionState(state(), 'purge', []).kind === 'open');
setCharge(30);
// Where the two blocks stand at the choice (the duel's verbs kept coming every 4 s during the root's DELETE: an MV may
// have moved one again): 7b's MERGE writes nothing there (R24: its drivers come back by radio, never in memory).
const c13Block = blockOf('POD 11');
const c13At = c13Block ? addrOf(c13Block.id) : -1;
const c14At = blockOf('POD 12') ? addrOf(blockOf('POD 12')!.id) : -1;
const eventsBefore = h.events.length;
const merged = chooseEnding(h.store, 'merge');
const radio = state().landing.lastLanding;
const radioPods = radio === null ? '-' : radio.drivers.map((driver) => `${driver.pod}@${driver.integrity}`).join(' ');
check(`MERGE with 30: chosen, ${MERGE_COST_CHARGE} charge spent`, merged === null && chargeLeft(state()) === 30 - MERGE_COST_CHARGE && decidedAs(state()) === 'merge',
  `${merged} charge ${chargeLeft(state())}`);
check(`…THE LAST LANDING (7b): POD 11, 12 and 13's drivers back by radio at ${MERGE_DRIVER_INTEGRITY}, in pod order`,
  state().hollow.finale.phase === 'last-landing' && radioPods === `11@${MERGE_DRIVER_INTEGRITY} 12@${MERGE_DRIVER_INTEGRITY} 13@${MERGE_DRIVER_INTEGRITY}`
  && JSON.stringify(radio?.pods) === '[11,12,13]', radioPods);
check('…never in memory (R24): no driver of theirs in memory, nothing written where POD 11\'s and POD 12\'s blocks stood (an MV moved one)',
  ['POD 11', 'POD 12', 'POD 13'].every((code) => soul(code) === undefined) && c13At !== -1 && c14At !== -1
  && [c13At, c14At].every((at) => segmentAt(at)?.type === 'free'),
  `${c13At} ${c14At}`);
check('…their pods released aboard (driver no longer lost, marked restored), the landing reopened: the verdict skipped', [11, 12, 13].every((pod) => podRecord(state(), pod).driverLost === null
  && podRecord(state(), pod).restored && podRecord(state(), pod).fate.kind === 'aboard') && state().landing.ended === null);
check('…POD 13 (its block deleted) comes back too: R25 restores every eaten pod still in orbit, whatever became of its block',
  radio?.drivers.some((driver) => driver.pod === 13) === true && podRecord(state(), 13).fate.kind === 'aboard');
check('…POD 01 (the belt\'s, not HOLLOW\'s) stays lost (dead), parked', podRecord(state(), 1).driverLost === 'dead' && podRecord(state(), 1).fate.kind === 'parked');
check('…no block of HOLLOW is left in memory, the memory is whole', !state().memory.some(isHollow)
  && (() => { try { assertMemoryInvariants(state().memory, MEMORY_LAYOUTS.FULL.totalBlocks); return true; } catch { return false; } })());
// WP12 p3 (the lead's note of 22:40): CONTROL's verdict waits until the typed ending is over (the card types it
// as its last line); said at the choice, the header's ticker spoiled the ending. Checked below, at the WAKE REPORT.
// Review M2: MERGE + REASSIGNMENT is compliant (ending-rules controlCompliant).
const mergeVerdict = (): boolean => state().log.entries.some((entry) => entry.text === FINALE_TEXT.verdict.compliant(47));
check('…the finale records it, and the TERMINAL says it, then lists each pod (`> pod11 ... DRIVER RESTORED · <FAMILY>`); CONTROL waits for the typed ending',
  JSON.stringify(state().hollow.finale.restored) === JSON.stringify([11, 12, 13])
  && state().log.entries.some((entry) => /^> merge unit_\d+ -> unit_\d+ \.\.\. OK$/.test(entry.text))
  && [11, 12, 13].every((pod) => state().log.entries.some((entry) => entry.text === LAST_LANDING_TEXT.radio(pod, podRecord(state(), pod).family)))
  && !mergeVerdict());
{
  const start = h.events.slice(eventsBefore).filter((event) => event.name === 'last-landing-start');
  const flier = state().landing.lastLanding?.flier;
  check('…\'last-landing-start\' once, with its 3 pods and its flier: blind (the classic unit holds no AUTODROP)', start.length === 1
    && JSON.stringify(start[0]?.payload) === JSON.stringify({ pods: 3, flier: 'blind' }) && flier === 'blind', JSON.stringify(start[0]?.payload));
  setMode(h.store, 'memory');
  check('…the SHIP view held (the MIND shut) and the keys on its own layer (R26)', state().ui.mode === 'tools' && activeLayer() === 'last-landing');
}
check('…a second choice is refused', chooseEnding(h.store, 'purge') !== null);

// THE LAST LANDING by [ENTER] (the arm's scenarios below watch v3, v1 and blind to their end), then the LANDING REPORT, RUN END.
{
  const endsBefore = h.events.length;
  let doneWithMachine = true;
  const offWatch = h.store.subscribe((now) => `${now.hollow.finale.phase}|${now.landing.lastLanding === null}`, (seen) => {
    if (seen === 'done|false' || seen === 'last-landing|true') doneWithMachine = false;
  });
  h.press('Enter');
  offWatch();
  const launches = [11, 12, 13].map((pod) => podRecord(state(), pod).fate).flatMap((fate) => (fate.kind === 'down' ? [fate.launch] : []))
    .sort((a, b) => a.atTSec - b.atTSec);
  const ended = h.events.slice(endsBefore).filter((event) => event.name === 'last-landing-end');
  const landedLz = [11, 12, 13].filter((pod) => { const fate = podRecord(state(), pod).fate; return fate.kind === 'down' && fate.touchdown.place === 'lz'; }).length;
  check('[ENTER]: THE LAST LANDING flown to its end in that keypress: POD 11, 12 and 13 down (\'merge\', blind, ×2 spread), the machine cleared and \'done\' in one update',
    state().landing.lastLanding === null && state().hollow.finale.phase === 'done' && doneWithMachine && launches.length === 3
    && launches.every((launch) => launch.source === 'merge') && [11, 12, 13].every((pod) => podRecord(state(), pod).restored),
    `${state().hollow.finale.phase} ${launches.map((launch) => launch.source).join()}`);
  check('…one pod per window, in pass order: three windows, each launch a cadence or more after the last',
    launches.every((launch, i) => i === 0 || launch.atTSec - launches[i - 1]!.atTSec >= LAST_LANDING_CADENCE_SEC * state().level.tacticalWarp));
  check('…\'last-landing-end\' once, with the restored pods that came down in an LZ with room', ended.length === 1
    && JSON.stringify(ended[0]?.payload) === JSON.stringify({ landed: landedLz }), JSON.stringify(ended[0]?.payload));
  check('…the input layer down with it', activeLayer() === 'game');
}
const end = h.wall() + 200;
while (state().run.phase === 'landing' && h.wall() < end) h.step();
check('…and the LANDING REPORT: the restored pods leave the parked list (POD 01 still in it), a RESTORED BY MERGE row (R29)',
  state().run.phase === 'report' && (() => {
    const model = landingReportModel(state());
    return model.rows.some((row) => row.kind === 'restored') && model.tally.parked.map((entry) => entry.pod).includes(1)
      && ![11, 12, 13].some((pod) => model.tally.parked.some((entry) => entry.pod === pod))
      && model.tally.restored === [11, 12, 13].reduce((sum, pod) => sum + podRecord(state(), pod).colonists, 0);
  })(), state().run.phase);
check('…and CONTROL said `Thank you, Unit 47. …` once the typed ending was over', mergeVerdict());
// The archive behind the page: a stub that keeps what it is given.
closeArchive();
openRunArchive(stubStorage());
h.store.update((d) => { d.archive = { status: 'ok' }; });
archiveRunStarted(h.store);
continueAfterReport(h.store);
check('RUN END: won-merge, the victory tone', state().run.phase === 'end' && state().run.endCause === 'won-merge' && runEndModel(state()).tone === 'victory',
  `${state().run.endCause} ${state().run.phase}`);
// Slice 3c SAVE (plan risk 3, decided): MERGE's next-run thread retires; archive v2 keeps no mergeBonus.
check('…the archive keeps endingsSeen [merge, reassignment] (slice 7a: both pieces; no mergeBonus: retired in 3c)', !('mergeBonus' in archiveMeta()) && JSON.stringify(archiveMeta().endingsSeen) === '["merge","reassignment"]'
  && archiveMeta().lastUnit?.cause === 'won-merge', JSON.stringify(archiveMeta()));

// The next run: no bonus any more (slice 3c, risk 3; deleted in the review fixes).
startRun(h.store, 77, archiveLineage());
h.step();
{
  const core = state().memory.find((seg) => seg.type === 'core');
  check('the next run: no MERGE bonus (deleted in 3c): its unit\'s Core has fewer than 3 threads, and the run carries no bonus field',
    !('mergeBonus' in state().run) && core?.type === 'core' && core.capacity < 3, `${core?.type === 'core' ? core.capacity : '?'} ${threadsTotal()}`);
  check('…and the Core reads healthy', selectCorruption(state()) === 0);
  // Slice 7c (R34, R35): mid-run HOLLOW is the relay stranger (031 on run 2), and the merged pair is the final root only
  // after a REASSIGNMENT trace (rootUnitsOf: traces/lineage).
  check('…and mid-run HOLLOW is the relay stranger (UNIT-031), not the merged pair', JSON.stringify(state().run.hollowUnits) === '[31]', JSON.stringify(state().run.hollowUnits));
}

// --- PURGE ---------------------------------------------------------------------------------------------------------------
closeArchive();
openRunArchive(stubStorage());
toTheDuel(h);
h.store.update((d) => { d.archive = { status: 'ok' }; });
archiveRunStarted(h.store);
eat(['POD 11']);
deleteRoot();
h.stepFor(ROOT_DELETE_SEC + 0.3);
// The pods land as the root falls (the landing goes on under the sleeping root), then the card comes up.
landInstantly(h.store);
settleFinale(h.store, () => h.step());
check('PURGE scenario: the choice is on', finaleAtStep1(state()));
setCharge(5);
check('…PURGE takes no charge and needs none', chooseEnding(h.store, 'purge') === null && chargeLeft(state()) === 5 && decidedAs(state()) === 'purge');
check('…every block of HOLLOW left memory; POD 11\'s driver stays lost (eaten)', !state().memory.some(isHollow)
  && podRecord(state(), 11).driverLost === 'eaten'
  && state().log.entries.some((entry) => /^> rm unit_\d+ \.\.\. OK$/.test(entry.text))
  // WP12 p3: CONTROL's verdict waits for the typed ending (checked at the LANDING REPORT below).
  && !state().log.entries.some((entry) => entry.text === FINALE_TEXT.verdict.compliant(47)));
landInstantly(h.store);
const purgeEnd = h.wall() + 200;
while (state().run.phase === 'landing' && h.wall() < purgeEnd) h.step();
check('…CONTROL said `Thank you, Unit 47. Your next post is RELAY 20.` once the verdict was over',
  state().log.entries.some((entry) => entry.text === FINALE_TEXT.verdict.compliant(47)));
continueAfterReport(h.store);
check('…RUN END won-purge, victory; the archive adds purge and reassignment (slice 7a; no mergeBonus kept: retired in 3c)', state().run.endCause === 'won-purge' && runEndModel(state()).tone === 'victory'
  && JSON.stringify(archiveMeta().endingsSeen) === '["purge","reassignment"]' && !('mergeBonus' in archiveMeta()), JSON.stringify(archiveMeta()));

// --- UNRESOLVED ---------------------------------------------------------------------------------------------------------
closeArchive();
toTheDuel(h);
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
const followedUp = (): boolean => { const f = state().hollow.finale; return f.phase === 'step1' && !f.rootFell && f.cardAtAi !== null && state().clock.aiSec >= f.cardAtAi; };
while (!followedUp() && state().run.phase === 'landing' && h.wall() < unresolvedEnd) h.step();
check('…the landing ended with the root standing: IT FOLLOWED YOU (R10), no entry 12, no step-1 pick', followedUp() && !state().run.log.found.includes(12)
  && pickStep1(h.store, 'purge') === 'NOT NOW', state().hollow.finale.phase);
check('…CONTINUE, then step 2 as usual', continueFollowed(h.store) === null && pickStep2(h.store, 'reassignment') === null && skipFinaleEnding(h.store));
while (state().run.phase === 'landing' && h.wall() < unresolvedEnd) h.step();
check('…the ship ends unresolved, then the LANDING REPORT', decidedAs(state()) === 'followed' && state().run.phase === 'report'
  && finaleRunCause(state()) === 'unresolved', `${state().hollow.finale.phase} ${state().run.phase}`);
continueAfterReport(h.store);
check('…RUN END unresolved, sombre', state().run.endCause === 'unresolved' && runEndModel(state()).tone === 'sombre');

// --- The tone: a flagship that landed nobody ----------------------------------------------------------------------------------
toTheDuel(h);
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
chooseEnding(h.store, 'purge', 'reassignment', { step: () => h.step() });
const zeroEnd = h.wall() + 30;
while (state().run.phase === 'landing' && h.wall() < zeroEnd) h.step();
continueAfterReport(h.store);
// WP11 fix round 1 (the review): the words too, not only the tone: never THE FLEET IS HOME over an empty flagship.
check('…then PURGE: won-purge, but the flagship landed nobody: the sombre tone and words (`LAST LIGHT · NOBODY LANDED`), never the victory ones',
  state().run.endCause === 'won-purge' && runEndModel(state()).tone === 'sombre' && runEndModel(state()).title === RUN_END_NOBODY_LANDED.title
  && runEndModel(state()).why === RUN_END_NOBODY_LANDED.why['won-purge'],
  `${state().run.endCause} ${runEndModel(state()).tone} ${runEndModel(state()).title} | ${runEndModel(state()).why}`);

check('LAST LIGHT is the flagship and the last ship', fixtureShip(4).final);

// --- §9 WP11's edge cases -----------------------------------------------------------------------------------------------
// The Core worn below its low mark mid-duel: fewer threads, but the running DELETE keeps its own (ops-core never takes a
// thread back), and the root is gone on time.
toTheDuel(h);
deleteRoot();
h.stepFor(2);
const threadsBefore = threadsTotal();
h.store.update((d) => {
  const core = d.memory.find((seg) => seg.type === 'core');
  if (!core || core.type !== 'core') throw new Error('last-landing: no Core');
  core.integrity = 30;
  d.ui.memoryRev++;
});
const threadsWorn = threadsTotal();
const deleteRunning = getOpsBySeg(theRoot(state().memory)?.id ?? '').some((operation) => operation.kind === 'delete');
h.stepFor(ROOT_DELETE_SEC - 2 + 0.3);
check('the Core worn to 30 mid-duel (fewer threads): the running DELETE keeps its thread, and the root is gone on time',
  threadsWorn < threadsBefore && deleteRunning && theRoot(state().memory) === null && state().hollow.finale.phase === 'asleep',
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

// === THE LAST LANDING on the arm's LAST LIGHT (slice 7b, R24–R29; last-landing-arm.ts) ======================================
const armLastLanding = (opts: ArmOpts): number[] => arm(h, opts);
function watchToEnd(maxWall = 2000): void {
  const end = h.wall() + maxWall;
  while (state().landing.lastLanding !== null && h.wall() < end) h.step();
  if (state().landing.lastLanding !== null) throw new Error('last-landing: THE LAST LANDING did not end');
}
const fateOf = (pod: number): GameState['landing']['pods'][number]['fate'] => podRecord(state(), pod).fate;
const launchOf = (pod: number): LaunchRecord => armLaunchOf(state(), pod);
const dotFromCentreKm = (launch: Readonly<LaunchRecord>): ReturnType<typeof armDotFromCentreKm> => armDotFromCentreKm(state(), launch);
const normalS = (launch: Readonly<LaunchRecord>): number => armNormalS(state(), launch);

// --- v3 on a healthy orbit: every pod soft in an LZ with room, full points (01 §3.17) ----------------------------------------
{
  const pods = armLastLanding({ autodrop: 3, eaten: 6 });
  const ll = state().landing.lastLanding!;
  const memoryAtStart = JSON.stringify(state().memory);
  check('arm LAST LIGHT, 6 eaten, AUTODROP v3: THE LAST LANDING flown by v3, AUTODROP\'s two orbits counted from the start (R27)',
    state().level.shipName === 'LAST LIGHT' && state().landing.forgiveness === 'gentle' && pods.length === 6 && ll.flier === 'v3'
    && ll.autodropUntilTSec !== null && activeLandingController(state())?.source === 'merge', `${state().level.shipName} ${ll.flier} ${pods.join()}`);
  check('…by radio: their drivers nowhere in memory, every pod released aboard (R24, R25)', pods.every((pod) => fateOf(pod).kind === 'aboard'
    && !driversInMemory(state()).some((driver) => driver.pod === pod)) && ll.drivers.length === 6);
  watchToEnd();
  const launches = pods.map(launchOf).sort((a, b) => a.atTSec - b.atTSec);
  check('…every pod soft in an LZ with room: full points, all placed by AUTODROP within its orbits (none blind)',
    pods.every((pod) => { const fate = fateOf(pod); return fate.kind === 'down' && fate.touchdown.place === 'lz' && fate.touchdown.touch === 'soft' && fate.touchdown.points === podRecord(state(), pod).colonists; })
    && launches.every((launch) => launch.source === 'merge' && launch.atTSec < ll.autodropUntilTSec! && Math.abs(launch.halfWidthKm - normalS(launch)) < 1e-6),
    pods.map((pod) => { const fate = fateOf(pod); return fate.kind === 'down' ? `${pod}:${fate.touchdown.place}/${fate.touchdown.points}` : `${pod}:${fate.kind}`; }).join(' '));
  check('…memory untouched from its start to its end (R24)', JSON.stringify(state().memory) === memoryAtStart);
  const cadenceSec = LAST_LANDING_CADENCE_SEC * state().level.tacticalWarp;
  check(`…no two launches closer than its cadence (${LAST_LANDING_CADENCE_SEC} tactical s, R26)`,
    launches.every((launch, i) => i === 0 || launch.atTSec - launches[i - 1]!.atTSec >= cadenceSec - 1e-6), launches.map((launch) => launch.atTSec.toFixed(0)).join(' '));
  const tally = onTargetTally(state());
  check('★ ON TARGET counts them, its denominator every pod of the ship (the restored ones included)', tally.pods === state().landing.pods.length
    && tally.colonists === state().landing.pods.reduce((sum, record) => sum + record.colonists, 0) && tally.onTargetPods === 6);
  const end = h.wall() + 60;
  while (state().run.phase === 'landing' && h.wall() < end) h.step();
  const model = landingReportModel(state());
  check('…the LANDING REPORT: the RESTORED BY MERGE row, the restored pods counted in the LZ rows and out of the parked list',
    state().run.phase === 'report' && model.rows.some((row) => row.kind === 'restored')
    && model.tally.restored === pods.reduce((sum, pod) => sum + podRecord(state(), pod).colonists, 0)
    && !model.tally.parked.some((entry) => pods.includes(entry.pod)) && model.tally.landedInLz === pods.reduce((sum, pod) => sum + podRecord(state(), pod).colonists, 0),
    state().run.phase);
}

// --- v1: one pod per window in pass order, each timed in its sure part (R27) ------------------------------------------------
{
  const pods = armLastLanding({ autodrop: 1, eaten: 4 });
  const ll = state().landing.lastLanding!;
  const period = getDropSolution()?.periodSec ?? NaN;
  h.press('KeyP');
  const paused = state().clock.paused;
  h.press('KeyP');
  check('P pauses and resumes on THE LAST LANDING\'s layer', paused && !state().clock.paused);
  // The kid's hands are refused every way in while MERGE flies (the coordinator's addition, via Track VIEW): [L]'s and the
  // POD BAY's playerLaunch, __ap.launch's requestLaunch as 'player'; MERGE's own launches are not.
  {
    const eventsBefore = h.events.length;
    const asked = playerLaunch(h.store, () => { throw new Error('last-landing: a refused launch asked to confirm'); });
    const debugAsked = requestLaunch(h.store, { source: 'player', pod: pods[0]! });
    const refusedKeys = h.events.slice(eventsBefore).filter((event) => event.name === 'refused').map((event) => (event.payload as { reason: string }).reason);
    check('a player launch while MERGE flies: refused MERGE FLYING (playerLaunch and __ap.launch\'s path), its buzz, nothing launched',
      asked.kind === 'refused' && asked.reason === 'MERGE FLYING' && debugAsked.kind === 'refused' && debugAsked.reason === 'MERGE FLYING'
      && refusedKeys.length === 2 && refusedKeys.every((key) => key === launchRefusalKey('MERGE FLYING')) && pods.every((pod) => fateOf(pod).kind === 'aboard'),
      `${JSON.stringify(asked)} ${JSON.stringify(debugAsked)} ${refusedKeys.join()}`);
    const sol = getDropSolution();
    const paused = { ...state(), clock: { ...state().clock, paused: true } };
    check('…it outranks PAUSED and NO DROP SOLUTION, and never applies to MERGE\'s own launches',
      launchRefusal(paused, null, { source: 'player', fromMind: false }) === 'MERGE FLYING'
      && launchRefusal(paused, null, { source: 'merge', fromMind: true }) === 'PAUSED'
      && launchRefusal(state(), sol, { source: 'merge', fromMind: true }) !== 'MERGE FLYING');
    const caps = capabilitiesNow(state());
    const bay = bayWindowModel(state(), sol, 'closed', { ...caps, bay: { ...caps.bay, offline: true } });
    check('…the POD BAY\'s LAUNCH says it (blocked), over NO BAY CTRL (no bay applies), in ≤ 70 characters',
      bay.launch.look === 'blocked' && bay.launch.status === LAUNCH_REFUSAL_TEXT['MERGE FLYING'] && LAUNCH_REFUSAL_TEXT['MERGE FLYING'].length <= 70,
      JSON.stringify(bay.launch));
  }
  watchToEnd();
  const launches = pods.map(launchOf).sort((a, b) => a.atTSec - b.atTSec);
  check('arm LAST LIGHT, 4 eaten, AUTODROP v1: flown by v1, each pod at the normal spread, every dot\'s centre inside its LZ\'s sure part',
    ll.flier === 'v1' && launches.every((launch) => {
      const { km, lz } = dotFromCentreKm(launch);
      return launch.source === 'merge' && Math.abs(launch.halfWidthKm - normalS(launch)) < 1e-6 && Math.abs(km) <= lz.widthKm / 2 - launch.halfWidthKm + 1;
    }), launches.map((launch) => `${launch.aimLz}@${dotFromCentreKm(launch).km.toFixed(0)}`).join(' '));
  check('…one pod per window, in the order the ship passes them: the LZs in pass order, never two in one window, all within its orbits',
    launches.every((launch, i) => i === 0 || (launch.aimLz !== launches[i - 1]!.aimLz && launch.atTSec - launches[i - 1]!.atTSec < period))
    && launches.every((launch) => launch.atTSec < ll.autodropUntilTSec!), launches.map((launch) => `${launch.aimLz}:${launch.atTSec.toFixed(0)}`).join(' '));
}

// --- Blind (no AUTODROP): one pod per window, the moment within ±(W/2 + 150 km), ×2 spread (R27) -----------------------------
{
  const seeds = byDepth([11], Array.from({ length: 20 }, (_, i) => 11 + i));
  let pods = 0;
  let worth = 0;
  let inMargin = true;
  let doubled = true;
  let perWindow = true;
  let reach = 0;
  for (const drawSeed of seeds) {
    const restored = armLastLanding({ autodrop: null, eaten: 4, drawSeed });
    const ll = state().landing.lastLanding!;
    if (ll.flier !== 'blind' || ll.autodropUntilTSec !== null) throw new Error(`last-landing: the blind flier is ${ll.flier}`);
    watchToEnd();
    const launches = restored.map(launchOf).sort((a, b) => a.atTSec - b.atTSec);
    for (const [i, launch] of launches.entries()) {
      const { km, lz } = dotFromCentreKm(launch);
      reach = Math.max(reach, Math.abs(km) / (lz.widthKm / 2 + BLIND_MARGIN_KM));
      inMargin &&= Math.abs(km) <= lz.widthKm / 2 + BLIND_MARGIN_KM + 2;
      doubled &&= Math.abs(launch.halfWidthKm - BLIND_DROP_MULT * normalS(launch)) < 1e-6;
      perWindow &&= i === 0 || dotFromCentreKm(launches[i - 1]!).lz.label !== lz.label;
    }
    for (const pod of restored) {
      const fate = fateOf(pod);
      if (fate.kind !== 'down') throw new Error(`last-landing: blind pod ${pod} is ${fate.kind}`);
      pods++;
      worth += fate.touchdown.points / podRecord(state(), pod).colonists;
    }
  }
  const mean = worth / pods;
  check(`blind on ${seeds.length} draw${seeds.length === 1 ? '' : 's'} × 4 pods: every drop ×${BLIND_DROP_MULT} the spread, its dot within ±(W/2 + ${BLIND_MARGIN_KM} km) of the LZ's centre`,
    doubled && inMargin && reach > 0.5, `reach ${reach.toFixed(2)} of the margin`);
  check('…one pod per window (the next one goes to the next LZ the ship passes)', perWindow);
  // The worth needs the 20 draws (80 pods): quick depth flies one (ending/last-landing-sweep has every flier's numbers).
  fullOnly('blind\'s worth on 20 draws', () => {
    check(`…worth ${mean.toFixed(2)} of a full pod on this GENTLE planet (01: about 0.75; 0.6–0.9)`, mean >= 0.6 && mean <= 0.9, `${mean.toFixed(3)} over ${pods} pods`);
  });
}
{
  // The draws themselves (pure): 200 turns of the same window, uniform over ±(W/2 + 150 km) as times about its centre.
  armLastLanding({ autodrop: null, eaten: 1 });
  const ll = state().landing.lastLanding!;
  const sol = getDropSolution()!;
  const fracs: number[] = [];
  const windows = new Set<string>();
  for (let turn = 0; turn < 200; turn++) {
    const target = nextTurn(state(), { ...ll, turns: turn }, sol);
    if (target === null) throw new Error('last-landing: no blind turn');
    windows.add(`${target.lz}@${target.centreTSec.toFixed(0)}`);
    const lz = state().landing.lzs.find((candidate) => candidate.label === target.lz)!;
    const win = windowsAhead(sol, state().clock.tSec, 1).find((candidate) => candidate.lz === target.lz)!;
    const reachSec = ((win.close - win.open) / 2) * ((lz.widthKm / 2 + BLIND_MARGIN_KM) / (lz.widthKm / 2));
    fracs.push((target.atTSec - target.centreTSec) / reachSec);
  }
  const mean = fracs.reduce((sum, frac) => sum + frac, 0) / fracs.length;
  check('blind\'s moments, 200 turns of one window: uniform within its reach (mean near 0, both ends reached)',
    windows.size === 1 && fracs.every((frac) => frac >= -1 - 1e-9 && frac <= 1 + 1e-9) && Math.abs(mean) < 0.12
    && Math.min(...fracs) < -0.9 && Math.max(...fracs) > 0.9, `${[...windows].join()} mean ${mean.toFixed(3)} min ${Math.min(...fracs).toFixed(2)} max ${Math.max(...fracs).toFixed(2)}`);
  skipLastLanding(h.store);
}

// --- v2: a pass armed each orbit on the machine's own pass, the kid's AUTODROP machine never written (R27; 7b review) ---------
const watchedV2 = new Map<number, string>();
{
  const pods = armLastLanding({ autodrop: 2, eaten: 2 });
  const ll = state().landing.lastLanding!;
  // The kid's pass fields (flownAs, the version flown at the last tick, moves with AUTODROP's own post tick).
  const kidPass = (): string => { const ad = state().landing.autodrop; return JSON.stringify([ad.armed, ad.pass, ad.sent, ad.armedAtTSec]); };
  const kidBefore = kidPass();
  h.stepFor(0.2);
  const pass = state().landing.lastLanding!.pass;
  check('AUTODROP v2: flown by v2, its own pass armed at the start with the counts [G] would prefill, the kid\'s machine untouched',
    ll.flier === 'v2' && pass !== null && pass.armedAtTSec >= ll.startTSec && Object.values(pass.pass).reduce((sum, n) => sum + n, 0) > 0
    && kidPass() === kidBefore, JSON.stringify(pass));
  // The POD BAY's [−]/[+] (setPassCount) and [G] (pressAutodrop) are the kid's: refused while MERGE flies (7b review).
  setPassCount(h.store, Object.keys(pass?.pass ?? {})[0] ?? 'LZ-A', 0);
  const g = pressAutodrop(h.store);
  check('…the POD BAY\'s [−]/[+] change nothing, its [G] is refused MERGE FLYING', g === 'MERGE FLYING' && kidPass() === kidBefore
    && JSON.stringify(state().landing.lastLanding!.pass) === JSON.stringify(pass), `${g} ${kidPass()}`);
  watchToEnd();
  for (const pod of pods) watchedV2.set(pod, JSON.stringify(fateOf(pod)));
  const launches = pods.map(launchOf);
  check('…every pod placed by AUTODROP within its orbits (normal spread), in an LZ with room', launches.every((launch) =>
    launch.atTSec < ll.autodropUntilTSec! && Math.abs(launch.halfWidthKm - normalS(launch)) < 1e-6)
    && pods.every((pod) => { const fate = fateOf(pod); return fate.kind === 'down' && fate.touchdown.place === 'lz'; }));
  const rest = state().landing.autodrop;
  check('…and AUTODROP\'s machine at rest when it ends (the codec\'s rule at ENDING CHOSEN)', rest.armed === null && rest.armedAtTSec === null
    && !rest.claimed && rest.waitingSinceTSec === null, JSON.stringify(rest));
}

// --- [ENTER] skips to the result by the same rules (R28): v2's landing again, in one keypress ----------------------------------
{
  const pods = armLastLanding({ autodrop: 2, eaten: 2 });
  const layer = activeLayer();
  h.press('Enter');
  check('[ENTER] on its own layer: THE LAST LANDING over in that one keypress, every pod down, \'done\'', layer === 'last-landing'
    && state().landing.lastLanding === null && state().hollow.finale.phase === 'done' && pods.every((pod) => fateOf(pod).kind === 'down'));
  check('…the same landing as the one watched above (the same streams, at the clock\'s own step)', pods.length === watchedV2.size
    && pods.every((pod) => watchedV2.get(pod) === JSON.stringify(fateOf(pod))));
}

// --- AUTODROP's two orbits (R27): a pod it has not placed by then drops blind in the next window -----------------------------
{
  // Sensor Interp and Nav Plotter failing: every pod's dot too wide for every LZ's sure part, so v3 plans nothing.
  const pods = armLastLanding({ autodrop: 3, eaten: 1, sensor: 30, navplot: 30 });
  const ll = state().landing.lastLanding!;
  const sol = getDropSolution()!;
  check(`v3 with Sensor Interp and Nav Plotter failing: its deadline is ${LAST_LANDING_AUTODROP_ORBITS} orbits from the start, and no window can take a pod`,
    ll.flier === 'v3' && ll.autodropUntilTSec !== null && Math.abs(ll.autodropUntilTSec - ll.startTSec - LAST_LANDING_AUTODROP_ORBITS * sol.periodSec) < 1
    && planLanding(state(), landingView(state(), sol, 2)).rows.length === 0, `${ll.autodropUntilTSec} ${ll.startTSec} ${sol.periodSec}`);
  // Its orbits run out by hand (flying both costs the tier two orbits of windows at TACTICAL; the rule is the deadline).
  const until = state().clock.tSec + 1;
  h.store.update((d) => { d.landing.lastLanding!.autodropUntilTSec = until; });
  watchToEnd();
  const launch = launchOf(pods[0]!);
  check(`…past its deadline the pod drops blind (×${BLIND_DROP_MULT} the spread) in a window after it, and lands`,
    launch.atTSec > until && Math.abs(launch.halfWidthKm - BLIND_DROP_MULT * normalS(launch)) < 1e-6 && fateOf(pods[0]!).kind === 'down',
    `until ${until.toFixed(0)}: ${launch.atTSec.toFixed(0)}/${launch.halfWidthKm.toFixed(0)}`);
}

// --- No drop solution (Nav Plotter dead): the pods drop blind on the plotter-free geometry (01 §3.17; 7b review) ------------
{
  const pods = armLastLanding({ autodrop: 3, eaten: 2, navplot: 0 });
  const ll = state().landing.lastLanding!;
  check('Nav Plotter dead: no drop solution, so the flier is blind (R27)', ll.flier === 'blind' && !capabilitiesNow(state()).drop.solution);
  h.stepFor(0.2);
  const sol = getDropSolution();
  check('…the drop cache solves the geometry anyway while THE LAST LANDING runs: a dot, grey (uncertain), windows', sol !== null && sol.block === null
    && sol.dot !== null && sol.uncertain && sol.windows.length > 0);
  // Skipped while paused: [ENTER] lets the clock go first.
  h.press('KeyP');
  const paused = state().clock.paused;
  skipLastLanding(h.store);
  check('…[ENTER] (paused: let go first): every pod dropped blind (×2 spread) and down, \'done\'', state().landing.lastLanding === null
    && state().hollow.finale.phase === 'done' && pods.every((pod) => fateOf(pod).kind === 'down'
      && Math.abs(launchOf(pod).halfWidthKm - BLIND_DROP_MULT * normalS(launchOf(pod))) < 1e-6) && paused && !state().clock.paused,
    pods.map((pod) => fateOf(pod).kind).join());
}

// --- The plotter lost mid-landing (a belt hit): v3 turns blind for the pods left (R27; 7b review) ------------------------------
{
  const pods = armLastLanding({ autodrop: 3, eaten: 4 });
  h.stepFor(0.2);
  h.store.update((d) => { for (const seg of d.memory) if ('role' in seg && seg.role === 'navplot' && 'integrity' in seg) seg.integrity = 0; d.ui.memoryRev++; });
  h.step();
  const ll = state().landing.lastLanding!;
  check('Nav Plotter dead mid-landing: the flier turns blind, AUTODROP\'s deadline gone', ll.flier === 'blind' && ll.autodropUntilTSec === null);
  skipLastLanding(h.store);
  check('…and every pod still comes down (blind)', pods.every((pod) => fateOf(pod).kind === 'down'), pods.map((pod) => fateOf(pod).kind).join());
}

// --- Bay Ctrl missing: no bay applies, so nothing ends the landing early (R26; 7b review) ----------------------------------------
{
  const pods = armLastLanding({ autodrop: 3, eaten: 3 });
  h.store.update((d) => {
    const i = d.memory.findIndex((seg) => 'role' in seg && seg.role === 'bay');
    d.memory[i] = { id: 'free~bay', name: 'Free', type: 'free', size: d.memory[i]!.size };
    mergeAdjacentFree(d.memory);
    d.ui.memoryRev++;
  });
  check('Bay Ctrl missing: landingStuck does not end THE LAST LANDING (no bay applies)', landingStuck(state(), getDropSolution()) === null);
  watchToEnd();
  check('…every restored pod lands (v3), soft in an LZ with room', pods.every((pod) => { const fate = fateOf(pod); return fate.kind === 'down' && fate.touchdown.place === 'lz'; }),
    pods.map((pod) => fateOf(pod).kind).join());
}

// --- MERGE with no driver eaten: nothing to restore, no LAST LANDING (7b review) ----------------------------------------------
{
  const none = armLastLanding({ autodrop: 3, eaten: 0 });
  check('MERGE with no driver eaten: no LAST LANDING, the FINALE decided at once, the layer and the resolver idle', none.length === 0
    && state().landing.lastLanding === null && state().hollow.finale.phase === 'done' && activeLayer() === 'game'
    && activeLandingController(state())?.source !== 'merge' && JSON.stringify(state().hollow.finale.restored) === '[]');
}

// --- The ship lost mid-landing: THE LAST LANDING ends with it, nothing throws (7b review) --------------------------------------
{
  const pods = armLastLanding({ autodrop: 3, eaten: 3 });
  h.stepFor(0.3);
  endLandingLost(h.store, 'crashed');
  h.step();
  check('the ship lost mid-landing: the landing ends \'ship-lost\' (its pods aboard NOT LAUNCHED), the machine cleared, \'done\', the layer down, nothing painted',
    state().landing.ended === 'ship-lost' && state().landing.lastLanding === null && state().hollow.finale.phase === 'done' && activeLayer() === 'game'
    && pods.some((pod) => fateOf(pod).kind === 'not-launched') && lastLandingHeader(state()) === null,
    `${state().landing.ended} ${state().hollow.finale.phase} ${pods.map((pod) => fateOf(pod).kind).join()}`);
}

finish();
