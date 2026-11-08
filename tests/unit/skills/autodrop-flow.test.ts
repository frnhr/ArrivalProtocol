// Slice 4c, Track DROP (plan §8.1): AUTODROP flown on run 1's arm, store and keys (autodrop-arm: a constructed lock, so no
// capture is flown).
// • v1 CENTRE on HALCYON: the strip asks `WINDOW LZ-B — hold [L]`; held, each volley leaves around the bracket's centre,
//   inside the sure part, BULLSEYE; letting go stops the volley; a tap sends nothing and records 'released' (R4's lesson);
//   in the MIND [L] stays the manual key (SHIP SCREEN); a blur lets go. AUTODROP's own launches are no demos.
// • R5 measured on CORMORANT's LZ-A (6 pods): trained, 4 pods straddle the centre; untrained, 3, 1.5 tac s late.
// • v2 PASS on KESTREL, from the MIND: the split set in the POD BAY's numbers, [G], one Core thread per window and none
//   between, PASS DONE · A +2 · B +1; a second pass with every thread busy waits (`NEEDS A THREAD`) and launches late.
// • v3 PLAN on CORMORANT: one [G] lands all 9 pods by the plan, with one [F] per gap; v3 → v2 → v1 → OFF mid-landing (the
//   pass keeps its numbers, then the [L], then DROP BY HAND with the warning alert); REPAIR's offline is plain; the
//   controller dies with its file.
// • The demos: ARES-VII's manual launches are recorded (their offsets), AUTODROP v1 picked at the first desk (its second card),
//   and the next boot says `> SKILL TRAINED: AUTODROP.skl v1 · from your 3 drops · AIM n%`.
import { check, finish } from '../landing/checks';
import { createHarness7 } from '../wp7/harness7';
import { armLanding, ARM, ARM_SEED } from './autodrop-arm';
import { ensureLandingKeys, lockOn } from '../landing/harness-landing';
import { send, toDesk } from '../map/repo-fixture';
import type { GameState } from '@state/schema';
import type { LaunchRecord } from '@/types/landing';
import { startRun } from '@systems/run';
import { receiveTransmission } from '@systems/boot';
import { setMode } from '@systems/mode';
import { requestLaunch } from '@systems/landing';
import { autodropLineOf, autodropTutorialDue, setPassCount } from '@systems/autodrop';
import { centreOffsetTac, windowsAt } from '@systems/autodrop-plan';
import { activeLandingController } from '@systems/landing-controller';
import { getDropSolution } from '@systems/drop-cache';
import { getPrediction } from '@systems/predict';
import { skipBlockReason } from '@systems/pace';
import { releaseThread, reserveThread, threadsBusy, threadsTotal } from '@systems/ops-core';
import { trainingModel } from '@systems/training-model';
import { trainCell } from '@systems/training';
import { skillLive } from '@systems/capabilities';
import { freeSegment, mergeAdjacentFree, replaceRange, segmentStarts } from '@systems/memory-ops';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { setLandingMode } from '../support/landing-instant';
import { AUTODROP_TEXT } from '@data/autodrop-text';
import { BOOT_SKILL_TEXT } from '@data/training-text';
import { AUTODROP_UNTRAINED_OFFSET_TAC } from '@data/tuning';

const h = createHarness7(1);
ensureLandingKeys(h);
const st = (): Readonly<GameState> => h.store.getState();
const shown = (): string => st().director.shown?.text ?? '';
const said = (text: string): boolean => st().log.entries.some((entry) => entry.text === text);
const ad = () => st().landing.autodrop;

// Every pod AUTODROP launched, with its offset from its window's centre (tac s, measured as it left).
interface Sent { pod: number; lz: string; atTSec: number; offsetTac: number; sure: boolean }
let sent: Sent[] = [];
const seen = new Set<string>();   // `pod@launch time`: one launch, whatever the ship
function watchLaunches(): void {
  const sol = getDropSolution();
  for (const record of st().landing.pods) {
    if (record.fate.kind !== 'falling') continue;
    const launch: LaunchRecord = record.fate.launch;
    const key = `${record.pod}@${launch.atTSec}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (launch.source !== 'autodrop' || sol === null) continue;
    const lz = st().landing.lzs.find((candidate) => candidate.label === launch.aimLz);
    const sureKm = lz === undefined ? -1 : lz.widthKm / 2 - launch.halfWidthKm
      - Math.abs(((launch.dotRad - lz.centreRad + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * st().level.planet.R;
    sent.push({ pod: record.pod, lz: launch.aimLz ?? '?', atTSec: launch.atTSec, offsetTac: centreOffsetTac(sol, launch, st().level.tacticalWarp) ?? NaN, sure: sureKm >= 0 });
  }
}
// A new count: the pods launched so far (falling or down) are not this count's.
function resetWatch(): void {
  sent = [];
  seen.clear();
  for (const record of st().landing.pods) {
    if (record.fate.kind === 'falling' || record.fate.kind === 'down') seen.add(`${record.pod}@${record.fate.launch.atTSec}`);
  }
}
// Steps (watching launches) until `done`, pressing [F] whenever the strip offers a SKIP and `skip` allows it.
function stepUntil(done: () => boolean, maxWall: number, skip = false, each?: () => void): boolean {
  const end = h.wall() + maxWall;
  while (!done() && h.wall() < end) {
    h.step();
    watchLaunches();
    each?.();
    if (skip && st().clock.skipWarp === null && /\[F\]/.test(shown()) && skipBlockReason(st(), getPrediction()) === null) h.press('KeyF');
  }
  return done();
}
const windowOpen = (): boolean => st().landing.window !== null;
const sureOpen = (): boolean => st().landing.window?.sure === true;
const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

// --- v1 CENTRE on HALCYON ---------------------------------------------------------------------------------------------------
{
  armLanding(h, [ARM.ARES, ARM.HALCYON], { autodrop: 1, demos: [0.1, -0.1] });
  resetWatch();
  const demosBefore = st().run.stats.dropDemos.length;
  stepUntil(() => /hold \[L\]/.test(shown()), 120, true);
  const first = st().landing.window?.lz ?? windowsAt(getDropSolution()!, st().clock.tSec)[0]?.lz ?? '?';
  check('the strip asks for the hold: `WINDOW LZ-B — hold [L]: AUTODROP waits for the centre`', shown() === AUTODROP_TEXT.strip.hold(first)
    && st().clock.pace === 'tactical', `${shown()} · ${st().clock.pace}`);
  h.keyDown('KeyL');
  check('[L] down in GET READY is a hold: no pod yet, AUTODROP\'s controller flies (v1, holding TACTICAL, SHIP screen only)',
    ad().held && st().landing.pods.every((record) => record.fate.kind === 'aboard')
      && activeLandingController(st())?.source === 'autodrop' && activeLandingController(st())?.launchesFromMind === false
      && activeLandingController(st())?.holdsTactical === true);
  stepUntil(() => !windowOpen() && sent.length > 0, 60);
  h.keyUp('KeyL');
  const count = st().landing.lzs.find((lz) => lz.label === first)?.pods ?? 0;
  check(`held through ${first}'s window: its ${count} pods left inside the sure part, around the centre`, sent.length === count
    && sent.every((pod) => pod.sure && pod.lz === first) && Math.abs(mean(sent.map((pod) => pod.offsetTac))) < 0.35,
    sent.map((pod) => pod.offsetTac.toFixed(2)).join(' '));
  stepUntil(() => st().landing.pods.filter((record) => record.fate.kind === 'down').length >= count, 30);
  check('…and landed BULLSEYE (`> pod01 ... LANDED · BULLSEYE`)', said('> pod01 ... LANDED · BULLSEYE'));
  check('…AUTODROP\'s own launches are no demos', st().run.stats.dropDemos.length === demosBefore);
  // The tap: the next window, [L] pressed and let go in GET READY.
  stepUntil(() => /hold \[L\]/.test(shown()), 900, true);
  h.press('KeyL');
  check('a tap released before the first launch sends nothing: `end: \'released\'`, and R4\'s lesson is due',
    ad().end === 'released' && !ad().held && st().landing.pods.filter((record) => record.fate.kind === 'aboard').length === 5 - count
      && autodropTutorialDue(st(), 1));
  // The lesson waits for the window's own rows (they are `now`), and says it in the wait after.
  let lesson = '';
  stepUntil(() => lesson !== '', 120, false, () => { if (st().director.shown?.id === 'tut-autodrop-v1') lesson = shown(); });
  check('…the strip says it once: `HOLD [L] — AUTODROP waits for the centre`', lesson === AUTODROP_TEXT.tutorial.v1, lesson);
  // The MIND: [L] is the manual key there (SHIP SCREEN), never a hold. At the next sure window.
  stepUntil(() => /hold \[L\]/.test(shown()), 900, true);
  setMode(h.store, 'memory');
  const refusedBefore = h.events.filter((event) => event.name === 'refused').length;
  h.keyDown('KeyL');
  check('in the MIND [L] is no hold: refused SHIP SCREEN, nothing held', !ad().held
    && h.events.slice(refusedBefore).some((event) => event.name === 'refused' && (event.payload as { reason: string }).reason === 'LAUNCH|SHIP SCREEN'));
  h.keyUp('KeyL');
  setMode(h.store, 'tools');
  // A blur lets go (input.ts releases every held key).
  h.keyDown('KeyL');
  const heldThen = ad().held;
  h.blur();
  check('a blur lets go of the hold', heldThen && !ad().held);
  // Hold for one pod, then let go: the rest stay aboard.
  resetWatch();
  h.keyDown('KeyL');
  stepUntil(() => sent.length >= 1, 30);
  h.keyUp('KeyL');
  stepUntil(() => !windowOpen(), 60);
  check('letting go stops the volley: one pod went, the rest stay aboard', sent.length === 1
    && st().landing.pods.filter((record) => record.fate.kind === 'aboard').length === 5 - count - 1, `${sent.length} sent`);
}

// --- R5 measured: trained against untrained on CORMORANT's LZ-A (6 pods, STANDARD) -------------------------------------------
const aim: Record<string, { n: number; mean: number }> = {};
for (const [name, demos] of [['trained', [0.05, -0.05]], ['untrained', []]] as const) {
  armLanding(h, [ARM.ARES, ARM.HALCYON, ARM.KESTREL, ARM.VESPER, ARM.CORMORANT], { autodrop: 1, demos, healInstruments: true });
  resetWatch();
  stepUntil(() => /hold \[L\]/.test(shown()) && st().landing.window?.lz !== 'LZ-B' && windowsAt(getDropSolution()!, st().clock.tSec)[0]?.lz === 'LZ-A', 900, true);
  h.keyDown('KeyL');
  stepUntil(() => sent.length > 0 && !windowOpen(), 60);
  h.keyUp('KeyL');
  aim[name] = { n: sent.length, mean: mean(sent.map((pod) => pod.offsetTac)) };
}
check(`R5: trained, 4 pods straddle LZ-A's centre (mean ${aim.trained!.mean.toFixed(2)} tac s)`, aim.trained!.n === 4 && Math.abs(aim.trained!.mean) < 0.25);
check(`…untrained, 3 pods, ${AUTODROP_UNTRAINED_OFFSET_TAC} tac s late (mean ${aim.untrained!.mean.toFixed(2)})`, aim.untrained!.n === 3
  && Math.abs(aim.untrained!.mean - AUTODROP_UNTRAINED_OFFSET_TAC) < 0.25);
console.log(`INFO  AIM on CORMORANT LZ-A: trained ${aim.trained!.n} pods, mean offset ${aim.trained!.mean.toFixed(2)} tac s; untrained ${aim.untrained!.n} pods, ${aim.untrained!.mean.toFixed(2)} tac s`);

// --- v2 PASS on KESTREL, from the MIND ---------------------------------------------------------------------------------------
{
  armLanding(h, [ARM.ARES, ARM.HALCYON, ARM.KESTREL], { autodrop: 2, demos: [0] });
  resetWatch();
  h.step();
  check('v2\'s lesson is due before [G]', autodropTutorialDue(st(), 2) && !autodropTutorialDue(st(), 3));
  setPassCount(h.store, 'LZ-A', 2);
  setPassCount(h.store, 'LZ-B', 1);
  check('the POD BAY\'s numbers: A 2 · B 1, clamped to room', ad().pass['LZ-A'] === 2 && ad().pass['LZ-B'] === 1);
  setPassCount(h.store, 'LZ-B', 9);
  check('…a count over the LZ\'s room is clamped (B 9 → 3)', ad().pass['LZ-B'] === 3);
  setPassCount(h.store, 'LZ-B', 1);
  setMode(h.store, 'memory');
  h.press('KeyG');
  check('[G] from the MIND arms this pass: `AUTODROP ARMED · THIS PASS: A ×2 · B ×1`', ad().armed === 'pass' && ad().armedAtTSec !== null
    && said(AUTODROP_TEXT.radio.armedPass({ 'LZ-A': 2, 'LZ-B': 1 })) && !autodropTutorialDue(st(), 2));
  // Threads: a sample every tick of (claimed, a window or a volley near).
  // A launch's tick reads the claim as it stood before that tick (the post tick lets it go after a volley's last pod).
  let claimedInGap = false;
  let claimedAtLaunch = true;
  let launches = 0;
  let claimedBefore = ad().claimed;
  stepUntil(() => ad().armed === null, 1500, true, () => {
    const near = windowOpen() || st().clock.pace === 'tactical';
    if (ad().claimed && !near && st().clock.pace === 'cruise') claimedInGap = true;
    if (sent.length > launches) { launches = sent.length; if (!claimedBefore) claimedAtLaunch = false; }
    claimedBefore = ad().claimed;
  });
  check('it flew the pass from the MIND: LZ-A ×2 and LZ-B ×1, centred, all sure', sent.filter((pod) => pod.lz === 'LZ-A').length === 2
    && sent.filter((pod) => pod.lz === 'LZ-B').length === 1 && sent.every((pod) => pod.sure) && st().ui.mode === 'memory',
    sent.map((pod) => `${pod.lz}:${pod.offsetTac.toFixed(2)}`).join(' '));
  check('…holding a Core thread for each volley and none in the CRUISE between', claimedAtLaunch && !claimedInGap && !ad().claimed && threadsBusy() === 0,
    `at launch ${claimedAtLaunch} · in a gap ${claimedInGap} · now ${ad().claimed} · busy ${threadsBusy()}`);
  const line = autodropLineOf(st(), getDropSolution()!);
  check('…PASS DONE · A +2 · B +1, and it waits for the next [G]', ad().end === 'pass-done' && said(AUTODROP_TEXT.radio.passDone({ 'LZ-A': 2, 'LZ-B': 1 }))
    && line?.row?.text === AUTODROP_TEXT.strip.passDone({ 'LZ-A': 2, 'LZ-B': 1 }), `${JSON.stringify(ad())} · ${line?.row?.text}`);
  // Pass 2 with every thread busy: it waits, then launches late.
  resetWatch();
  setPassCount(h.store, 'LZ-A', 0);
  setPassCount(h.store, 'LZ-B', 1);
  h.press('KeyG');
  const owners: string[] = [];
  for (let i = 0; threadsBusy() < threadsTotal() && i < 8; i++) if (reserveThread(`test-${i}`)) owners.push(`test-${i}`);
  const waitsBefore = h.events.filter((event) => event.name === 'autodrop-wait').length;
  stepUntil(() => ad().waitingSinceTSec !== null, 900, true);
  h.step();
  check('every thread busy at T−8: `AUTODROP NEEDS A THREAD … — × AN OP`, the buzz event once', ad().waitingSinceTSec !== null
    && /^AUTODROP NEEDS A THREAD/.test(shown()) && h.events.filter((event) => event.name === 'autodrop-wait').length === waitsBefore + 1, shown());
  // Free the threads 1.5 tac s after the volley's slot: it claims and launches late.
  const sol = getDropSolution()!;
  const win = windowsAt(sol, st().clock.tSec).find((candidate) => candidate.lz === 'LZ-B')!;
  stepUntil(() => st().clock.tSec > win.centre + 1.5 * st().level.tacticalWarp, 60);
  check('…nothing launched while it waited', sent.length === 0);
  for (const owner of owners) releaseThread(owner);
  stepUntil(() => sent.length > 0 || !sureOpen(), 30);
  check('…a thread freed: it claims and launches late, still inside the sure part', sent.length === 1 && sent[0]!.sure && sent[0]!.offsetTac > 1.4,
    sent.map((pod) => pod.offsetTac.toFixed(2)).join(' '));
}

// --- v3 PLAN on CORMORANT ----------------------------------------------------------------------------------------------------
{
  armLanding(h, [ARM.ARES, ARM.HALCYON, ARM.KESTREL, ARM.VESPER, ARM.CORMORANT], { autodrop: 3, demos: [0], healInstruments: true });
  resetWatch();
  h.step();
  check('v3\'s lesson is due before [G]', autodropTutorialDue(st(), 3) && !autodropTutorialDue(st(), 2));
  h.press('KeyG');
  check('[G] arms the plan: `AUTODROP ARMED · THE PLAN: 2 PASSES · [F] BETWEEN THEM`', ad().armed === 'plan' && said(AUTODROP_TEXT.radio.armedPlan(2)));
  let fPresses = 0;
  stepUntil(() => st().landing.ended !== null, 2500, false, () => {
    if (st().clock.skipWarp === null && /\[F\]/.test(shown()) && skipBlockReason(st(), getPrediction()) === null) { h.press('KeyF'); fPresses++; }
  });
  stepUntil(() => st().run.phase === 'report', 60);
  const down = st().landing.pods.filter((record) => record.fate.kind === 'down' && record.fate.touchdown.place === 'lz');
  check('one [G] lands CORMORANT\'s 9 pods by the plan, every one AUTODROP\'s, into LZs with room', sent.length === 9 && down.length === 9
    && sent.every((pod) => pod.sure), `${sent.length} sent, ${down.length} in an LZ`);
  check('…with an [F] per gap between its windows (no SKIP chaining: R7)', fPresses >= 2, `${fPresses} [F]`);
  check('…and AUTODROP at rest at the landing\'s end (the codec\'s rule)', ad().armed === null && !ad().claimed && ad().armedAtTSec === null && !ad().held);
}

// --- v3 → v2 → v1 → OFF mid-landing; REPAIR's offline; the controller dies with its file ------------------------------------
{
  armLanding(h, [ARM.ARES, ARM.HALCYON, ARM.KESTREL, ARM.VESPER, ARM.CORMORANT], { autodrop: 3, demos: [0], healInstruments: true });
  resetWatch();
  h.step();
  h.press('KeyG');
  stepUntil(() => sent.length >= 4 && !windowOpen(), 900, true);
  const setIntegrity = (value: number, state: 'intact' | 'repairing' = 'intact'): void => {
    h.store.update((draft) => {
      for (const seg of draft.memory) if (seg.type === 'upgrade' && seg.upgrade === 'autodrop') { seg.integrity = value; seg.state = state; }
      draft.ui.memoryRev++;
    });
  };
  setIntegrity(64);
  h.step();
  check('v3 → v2 (64%): this pass\'s rows become the pass\'s numbers, armed \'pass\': `AUTODROP v3 → v2 — this pass flies; set the next one`',
    skillLive(st().memory, 'autodrop').version === 2 && ad().armed === 'pass' && (ad().pass['LZ-B'] ?? 0) > 0 && said(AUTODROP_TEXT.radio.v3to2),
    JSON.stringify(ad()));
  setIntegrity(40);
  h.step();
  check('v2 → v1 (40%: a v3 file FAILING works as v1): disarmed \'downgraded\', `hold [L] for the rest`', ad().armed === null
    && ad().end === 'downgraded' && said(AUTODROP_TEXT.radio.v2to1) && !ad().claimed);
  stepUntil(() => /hold \[L\]/.test(shown()), 900, true);
  h.keyDown('KeyL');
  setIntegrity(20);
  h.step();
  check('→ OFF (20%) while held: the hold ends \'off\', `AUTODROP.skl DAMAGED — DROP BY HAND`, a warning alert (no klaxon)',
    !ad().held && ad().end === 'off' && said(AUTODROP_TEXT.radio.damaged)
      && st().alerts.list.some((alert) => alert.id === 'autodrop-damaged' && alert.severity === 'warn'));
  h.keyUp('KeyL');
  setIntegrity(100);
  h.step();
  h.press('KeyG');
  const armedAgain = ad().armed === 'plan';
  setIntegrity(100, 'repairing');
  h.step();
  check('the kid\'s REPAIR takes it offline: disarmed \'offline\', said plainly (`OFF WHILE IT IS REPAIRED`)', armedAgain && ad().armed === null
    && ad().end === 'offline' && said(AUTODROP_TEXT.radio.offline));
  setIntegrity(100);
  h.step();
  h.press('KeyG');
  const before = activeLandingController(st())?.source ?? null;
  const memory = st().memory;
  const index = memory.findIndex((seg) => seg.type === 'upgrade' && seg.upgrade === 'autodrop');
  const addr = segmentStarts(memory)[index]!;
  replaceRange(memory, addr, addr + memory[index]!.size, [freeSegment(memory[index]!.size)], { opId: null, own: [memory[index]!] });
  mergeAdjacentFree(memory);
  h.store.update((draft) => { draft.ui.memoryRev++; });
  h.step();
  check('the controller dies with its file: armed, the file eaten, no controller on the next tick', before === 'autodrop'
    && activeLandingController(st()) === null && ad().armed === null && ad().end === 'off');
}

// --- The demos: ARES-VII by hand, AUTODROP picked at the first desk, the next boot's line -----------------------------------
{
  setLandingMode('manual');
  h.newRun(ARM_SEED);
  startRun(h.store, ARM_SEED, FIRST_RUN_LINEAGE);
  receiveTransmission(h.store);
  stepUntil(() => st().run.phase === 'flight', 30);
  h.store.update((draft) => { draft.hollow.phase = 'dormant'; for (const seg of draft.memory) if (seg.type === 'driver') seg.integrity = 100; });
  lockOn(h);
  const offsets: number[] = [];
  // Review M3: each the first launch of its window, so its cue is the window's launch moment (the sure part's opening).
  const LATE = [0.25, 0.5, 1.5];
  for (const late of LATE) {
    stepUntil(() => sureOpen() && st().landing.bay.cadenceLeftTac <= 0, 900, true);
    const sol = getDropSolution()!;
    const win = windowsAt(sol, st().clock.tSec)[0]!;
    stepUntil(() => st().clock.tSec >= win.sure!.lo + late * st().level.tacticalWarp, 30);
    const result = requestLaunch(h.store, { source: 'player' });
    if (result.kind === 'launched') offsets.push(st().run.stats.dropDemos.at(-1)?.offsetTac ?? NaN);
    stepUntil(() => !windowOpen(), 60);
  }
  check('ARES-VII by hand: each launch into the bracket is a demo, its offset from the slot the strip cued (+0.25, +0.5, +1.5 tac s)',
    st().run.stats.dropDemos.length === 3 && offsets.every((offset, i) => Math.abs(offset - LATE[i]!) < 0.1), offsets.map((x) => x.toFixed(2)).join(' '));
  stepUntil(() => st().run.phase === 'report', 120);
  toDesk(h.store);
  const cards = trainingModel(st()).cards;
  check('the first desk shows two cards, AUTOBURN v1 [1] and AUTODROP v1 [2] (R19)', cards.length === 2 && cards[1]?.name === 'AUTODROP v1');
  check('…AUTODROP v1 is the pick', trainCell(h.store, 'autodrop', { kind: 'version', version: 1 }) === null);
  const meanOffset = mean(offsets);
  const aimNow = Math.round(Math.max(40, Math.min(99, 100 - 40 * Math.abs(0.5 * meanOffset))));
  send(h.store, ARM.HALCYON);
  stepUntil(() => st().run.phase === 'flight', 40);
  const line = BOOT_SKILL_TEXT.trained('AUTODROP.skl', 1, 3, 'drops', aimNow);
  check(`the next boot: \`${line}\``, said(line), st().log.entries.filter((entry) => /SKILL/.test(entry.text)).map((entry) => entry.text).join(' | '));
}

finish();
