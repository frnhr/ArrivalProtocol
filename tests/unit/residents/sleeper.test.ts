// Slice 5, Track KIN (slice-5-plan §2.9, §7.1): the sleeper on run 1's CURLEW (seed 7, BARNABY), reached ARES-VII → PETREL →
// CURLEW on the WP7 harness, calm (the beam's seed freed, HOLLOW dormant) with DELETE and MOVE in hand (that route brings only
// SCAN and REPAIR). Each part starts from the same snapshot of the ship in flight:
// • hidden as an inactive backup; a SCAN of it and of its lock says what they are and wakes nothing; DELETE's hint; the
//   tools' rules on the three files (the lock's DELETE asks no question, MOVE is PINNED TO BARNABY.sys);
// • the wake by rm of the lock: three green lines with 05's years (2612 − 2240 = 372), 'resident-wake' and 'sleeper-woken',
//   then the offer with no timer, keys R and T, and no HOLD A WALL on a calm ship;
// • R23: a DEAL withdraws the standing offer, and MOTH offers again once it is settled; review m1: so does any other timed
//   choice (say.ts's one arbiter), and nothing else opens while one stands;
// • MEND DRIVERS: an infected driver under HOLLOW's drain is healed to 100 and cured, never `repairing`, then the next;
// • the gift at the ship's end (`taught by BARNABY`, 4 cycles), the record (woken, mend) and the notable event;
// • the wake by MOVE, its offer left standing at a LOST ship's end: woken with no job ('awake'), the gift paid all the same;
// • HOLD A WALL (slice 8, §2.6): offered with a seed a GAP from the drivers, not beside a WALL; MOTH.wall stands in that GAP,
//   flush against the drivers, and the seed's bites stop at it;
// • RUN THE DROPS: the 'resident' controller flies the landing (AUTODROP shadowed and unclaimed, no thread), every pod
//   launched with no key pressed, its own SKIPs between passes; MOTH is never food. Review M1: no `press [L]` in a window its
//   plan owns, the kid's rows back once the plan is empty (hurt drivers); m4: its volleys emit.
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { DriverSegment, Segment, HollowSegment } from '@/types/segment';
import { createHarness7 } from '../wp7/harness7';
import { restoreState } from '../wp1-rules/flows';
import { send, giveTools } from '../map/repo-fixture';
import { lockOn } from '../landing/harness-landing';
import { setLandingMode } from '../support/landing-instant';
import { giveSkillFile } from '../support/skills';
import { startRun, endShip, openDesk } from '@systems/run';
import { receiveTransmission } from '@systems/boot';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { on } from '@systems/events';
import { openChoiceEntry, choiceTimerRunning, pickChoice, sayChoice, otherOpenChoice, choiceMayOpen } from '@systems/say';
import { offerDealNow } from '@systems/hollow-deal';
import { infectNow, hollowReach } from '@systems/hollow';
import { activeLandingController } from '@systems/landing-controller';
import { landingResult } from '@systems/landing-rules';
import { notableEvents } from '@systems/lineage';
import { targetRefusal, deleteQuestion } from '@systems/tool-targets';
import { freeSegment, mergeAdjacentFree, segmentStarts, replaceRange, newSegId } from '@systems/memory-ops';
import { wallSpot, sleeperJobsNow, wakeSleeperNow, pickSleeperJob } from '@systems/resident-sleeper';
import { actionScan, actionDelete, actionMove } from '@state/actions';
import { driversInMemory, isInfected, isInfectable } from '@state/selectors';
import { RESIDENT_SEG_IDS, SLEEPER_JOB_KEYS } from '@data/residents';
import { RESIDENT_TEXT, RESIDENT_REFUSAL, pinnedRefusal } from '@data/resident-text';
import { KIN_TEXT } from '@data/kin-text';
import { TOOL_REFUSAL } from '@data/tool-text';
import { DRIVER_RULES } from '@data/script';
import { SLEEPER_GIFT_CYCLES } from '@data/tuning';
import type { FsToolKind } from '@/types/fs-tool';

const SEED = 7;
const h = createHarness7(SEED);
const st = (): Readonly<GameState> => h.store.getState();
const seg = (id: string): Segment | undefined => st().memory.find((candidate) => candidate.id === id);
const sleeper = (): NonNullable<GameState['resident']['sleeper']> => st().resident.sleeper!;
const rule = (target: Segment, activeKind: FsToolKind): string | null => targetRefusal(target, { state: st(), activeKind, pickedSource: null });
const until = (done: () => boolean, maxWall: number): void => { h.stepUntil(done, maxWall); };

const heard: { wake: unknown[]; woken: unknown[]; job: unknown[] } = { wake: [], woken: [], job: [] };
on('resident-wake', (payload) => heard.wake.push(payload));
on('sleeper-woken', (payload) => heard.woken.push(payload));
on('sleeper-job', (payload) => heard.job.push(payload));
const hearNothing = (): void => { heard.wake = []; heard.woken = []; heard.job = []; };

// ARES-VII → PETREL → CURLEW, CURLEW's boot played into its flight; then calm, and DELETE and MOVE given.
setLandingMode('manual');
h.newRun(SEED);
startRun(h.store, SEED, FIRST_RUN_LINEAGE);
if (!receiveTransmission(h.store)) throw new Error('sleeper: not on the title');
until(() => st().run.phase === 'flight', 30);
for (const slot of [1, 7]) {
  h.store.update((draft) => { draft.run.phase = 'report'; });
  send(h.store, slot);
  until(() => st().run.phase === 'flight', 40);
}
h.store.update((draft) => {
  draft.hollow.phase = 'dormant';
  draft.memory = draft.memory.map((block) => (block.type === 'hollow' ? freeSegment(block.size) : block));
  mergeAdjacentFree(draft.memory);
  draft.director.done.push(...DRIVER_RULES.map((driverRule) => driverRule.id), 'engine-io-fault', 'lesson-dot-wide', 'lesson-drag-sinks');
  draft.ui.memoryRev++;
});
giveTools(h.store, ['delete', 'move']);
const BASE = structuredClone(st());
const fresh = (): void => { restoreState(h, BASE); hearNothing(); };
const name = st().resident.def?.name ?? '?';
check(`CURLEW (slot 7) holds the sleeper ${name}, asleep`, st().level.shipName === 'CURLEW' && st().resident.def?.kind === 'sleeping'
  && name === 'BARNABY' && sleeper().phase === 'asleep', JSON.stringify(st().resident));

// --- Hidden, SCAN, the tools' rules ------------------------------------------------------------------------------------
{
  const mind = seg(RESIDENT_SEG_IDS.sleeper)!;
  const lock = seg(RESIDENT_SEG_IDS.sleepLock)!;
  check('BARNABY.sys looks like any inactive backup (grey, unscanned) with its 1-block sleep.lock beside it',
    mind.type === 'sleeper' && mind.name === 'BARNABY.sys' && mind.awake === false && mind.scanned === false && mind.desc === RESIDENT_TEXT.desc.sleeper
    && lock.type === 'sleep-lock' && st().memory.indexOf(lock) === st().memory.indexOf(mind) + 1 && lock.size === 1, JSON.stringify([mind, lock]));
  check('…it is never food (not infectable), nor is its lock', !isInfectable(mind) && !isInfectable(lock));
  check('DELETE on the sleeper gives the hint; REPAIR and COPY are refused; MOVE and SCAN work; SWAP is for ship files',
    rule(mind, 'delete') === RESIDENT_REFUSAL.sleeperAsleep && rule(mind, 'repair') === RESIDENT_REFUSAL.sleeperRepair
    && rule(mind, 'copy') === RESIDENT_REFUSAL.sleeperCopy && rule(mind, 'move') === null && rule(mind, 'scan') === null
    && rule(mind, 'swap') === TOOL_REFUSAL.swapShipOnly, ['delete', 'repair', 'copy', 'move', 'scan'].map((tool) => rule(mind, tool as FsToolKind)).join(' | '));
  check('the lock: DELETE allowed with no question, MOVE PINNED TO BARNABY.sys, COPY refused, SCAN works',
    rule(lock, 'delete') === null && deleteQuestion(st(), lock) === null && rule(lock, 'move') === pinnedRefusal('BARNABY')
    && rule(lock, 'move') === 'PINNED TO BARNABY.sys' && rule(lock, 'copy') === TOOL_REFUSAL.logCopy && rule(lock, 'scan') === null);
  actionScan(h.store, mind);
  until(() => mind.type === 'sleeper' && mind.scanned && seg(RESIDENT_SEG_IDS.sleeper)?.desc === KIN_TEXT.sleeper.scannedDesc, 10);
  actionScan(h.store, lock);
  until(() => seg(RESIDENT_SEG_IDS.sleepLock)?.desc === KIN_TEXT.sleeper.lockDesc('BARNABY'), 10);
  h.step();
  check('SCAN on it: `Not inactive. Asleep. Held by sleep.lock`; on the lock: `holds BARNABY.sys asleep · DO NOT REMOVE`; nothing wakes',
    seg(RESIDENT_SEG_IDS.sleeper)?.desc === 'Not inactive. Asleep. Held by sleep.lock'
    && seg(RESIDENT_SEG_IDS.sleepLock)?.desc === 'holds BARNABY.sys asleep · DO NOT REMOVE' && sleeper().phase === 'asleep' && heard.woken.length === 0,
    JSON.stringify([seg(RESIDENT_SEG_IDS.sleeper)?.desc, seg(RESIDENT_SEG_IDS.sleepLock)?.desc, sleeper().phase]));
}

// --- The wake by rm, and the offer ------------------------------------------------------------------------------------
fresh();
const fromLog = st().log.entries.length;
actionDelete(h.store, seg(RESIDENT_SEG_IDS.sleepLock)!);
until(() => sleeper().phase === 'offering', 10);
{
  const lines = st().log.entries.slice(fromLog).filter((entry) => entry.speaker === 'sleeper').map((entry) => entry.text);
  const choice = openChoiceEntry(st());
  check('rm sleep.lock wakes it: its three green lines, the years templated (2612 − 2240 = 372 asleep)',
    sleeper().wokenBy === 'rm' && seg(RESIDENT_SEG_IDS.sleepLock) === undefined && lines.slice(0, 3).join('\n') === [
      'BARNABY: ...oh! hello. is it time? did i oversleep?', 'BARNABY: 372 years. goodness. you must be the caretaker.',
      'BARNABY: i\'m BARNABY. i sing to the pods.'].join('\n'), lines.join(' / '));
  check('…\'resident-wake\' (sleeping, no surprise) and \'sleeper-woken\' (rm), once each',
    JSON.stringify(heard.wake) === JSON.stringify([{ kind: 'sleeping', name: 'BARNABY', surprise: false }])
    && JSON.stringify(heard.woken) === JSON.stringify([{ name: 'BARNABY', by: 'rm' }]), JSON.stringify(heard));
  const mind = seg(RESIDENT_SEG_IDS.sleeper);
  check('…the file is awake (the strip stops calling it inactive)', mind?.type === 'sleeper' && mind.awake && mind.desc === KIN_TEXT.sleeper.awakeDesc('BARNABY'));
  check('…then its offer, in the TERMINAL, with no timer: `would you like some help?`, keys R and T, no HOLD A WALL on a calm ship',
    choice !== null && choice.speaker === 'sleeper' && choice.text === 'BARNABY: would you like some help?' && choice.choice?.timeoutAiSec === null
    && JSON.stringify(choice.choice?.options) === JSON.stringify(['RUN THE DROPS', 'MEND DRIVERS'])
    && JSON.stringify(choice.choice?.keys) === JSON.stringify([SLEEPER_JOB_KEYS.drops, SLEEPER_JOB_KEYS.mend]) && sleeper().entryId === choice.id,
    JSON.stringify(choice));
  const at = st().clock.aiSec;
  until(() => st().clock.aiSec > at + 40, 60);
  check('…and it waits: 40 AI s later it still stands, its timer never running', openChoiceEntry(st())?.id === choice?.id
    && !choiceTimerRunning(st(), openChoiceEntry(st())!) && sleeper().phase === 'offering');
}

// --- R23: a DEAL takes the offer back; MOTH offers again once it is settled ---------------------------------------------
{
  const first = sleeper().entryId;
  h.store.update((draft) => { draft.hollow.cfg = { ...draft.hollow.cfg, deal: true }; });
  offerDealNow(h.store, driversInMemory(st())[0]);
  h.step();
  const deal = openChoiceEntry(st());
  check('R23: a DEAL offered while MOTH\'s offer stands takes it back (woken, no job); the DEAL is the one open choice',
    sleeper().phase === 'awake' && sleeper().entryId === null && deal?.speaker === 'hollow'
    && st().log.entries.find((entry) => entry.id === first)?.choice?.open === false, JSON.stringify({ sleeper: sleeper(), deal: deal?.text }));
  until(() => false, 3);
  check('…and MOTH never offers while it stands', sleeper().phase === 'awake' && openChoiceEntry(st())?.id === deal?.id);
  pickChoice(deal!.id, 'REFUSE');
  until(() => sleeper().phase === 'offering', 5);
  check('…once the DEAL is settled, MOTH offers again', st().hollow.deal.phase === 'done' && sleeper().phase === 'offering'
    && sleeper().entryId !== first && openChoiceEntry(st())?.speaker === 'sleeper', JSON.stringify(sleeper()));
}

// --- Review m1: say.ts's one arbiter, with a second choice that is not a DEAL (slice 7's CONTACT, say) ------------------------
{
  const before = sleeper().entryId!;
  let answered: string | null | undefined;
  const contact = sayChoice('sys', 'CONTACT? A SIGNAL ANSWERS', ['ANSWER', 'IGNORE'], 15, (picked) => { answered = picked; });
  h.step();
  check('m1: any timed choice takes MOTH\'s offer back (not only HOLLOW\'s DEAL): one choice stands, the new one',
    sleeper().phase === 'awake' && sleeper().entryId === null && st().log.entries.find((entry) => entry.id === before)?.choice?.open === false
    && openChoiceEntry(st())?.id === contact && otherOpenChoice(st(), contact) === null, JSON.stringify(sleeper()));
  let threw = false;
  try { sayChoice('sys', 'A SECOND QUESTION', ['A', 'B'], 15, () => {}); } catch { threw = true; }
  check('…while it stands nothing else may open (choiceMayOpen false either way; a second sayChoice throws)',
    !choiceMayOpen(st(), false) && !choiceMayOpen(st(), true) && threw);
  until(() => false, 2);
  check('…and MOTH waits under it', sleeper().phase === 'awake' && openChoiceEntry(st())?.id === contact);
  pickChoice(contact, 'IGNORE');
  until(() => sleeper().phase === 'offering', 5);
  check('…once it is answered, MOTH offers again', answered === 'IGNORE' && sleeper().phase === 'offering' && sleeper().entryId !== before
    && openChoiceEntry(st())?.speaker === 'sleeper');
}

// --- MEND DRIVERS ---------------------------------------------------------------------------------------------------------
{
  const [a, b] = driversInMemory(st()) as [DriverSegment, DriverSegment];
  h.store.update((draft) => {
    draft.hollow.phase = 'awake';
    for (const driver of draft.memory) if (driver.type === 'driver') driver.integrity = driver.id === a.id ? 30 : driver.id === b.id ? 60 : 100;
  });
  infectNow(h.store, a);
  pickChoice(sleeper().entryId!, KIN_TEXT.sleeper.jobs.mend);
  until(() => sleeper().mendingId !== null, 1);
  check('MEND DRIVERS: the job starts (its line, \'sleeper-job\'), on the lowest-integrity driver', sleeper().phase === 'working'
    && sleeper().job === 'mend' && sleeper().mendingId === a.id && JSON.stringify(heard.job) === JSON.stringify([{ job: 'mend' }])
    && st().log.entries.some((entry) => entry.text === KIN_TEXT.sleeper.jobLine.mend('BARNABY')), JSON.stringify(sleeper()));
  const t0 = st().clock.aiSec;
  let repairing = false;
  until(() => {
    const now = driversInMemory(st()).find((driver) => driver.id === a.id)!;
    if (now.state === 'repairing') repairing = true;
    return now.integrity >= 100 && !isInfected(now);
  }, 15);
  const healedIn = st().clock.aiSec - t0;
  const now = driversInMemory(st()).find((driver) => driver.id === a.id)!;
  // 70 points at 18.5 %/s less HOLLOW's 2.5 %/s drain: about 4.4 s.
  check(`…an infected driver at 30% under HOLLOW's drain climbs to 100 and is cured, in ${healedIn.toFixed(1)} s (REPAIR v1's rate, no thread, never 'repairing')`,
    now.integrity === 100 && !isInfected(now) && !repairing && healedIn > 3.5 && healedIn < 5.5 && st().run.licences.length > 0, JSON.stringify(now));
  until(() => sleeper().mendingId === b.id, 2);
  until(() => driversInMemory(st()).find((driver) => driver.id === b.id)!.integrity >= 100, 5);
  check('…then on to the next (60% → 100)', driversInMemory(st()).find((driver) => driver.id === b.id)!.integrity === 100, JSON.stringify(sleeper()));
  const grantsBefore = st().run.skills.grants.length;
  endShip(h.store, 'locked');
  openDesk(h.store, null);
  const grant = st().run.skills.grants[grantsBefore];
  const met = st().run.residents.met.at(-1);
  check(`the gift at the ship's end: +${SLEEPER_GIFT_CYCLES} cycles, \`taught by BARNABY\`; the record says woken, MEND DRIVERS`,
    grant?.source === 'resident' && grant.cycles === 4 && grant.label === 'taught by BARNABY' && st().run.skills.grants.length === grantsBefore + 1
    && met?.name === 'BARNABY' && met.fate === 'woken' && met.job === 'mend' && met.slot === 7, JSON.stringify({ grant, met }));
  check('…and the archive\'s notable events name it (\'sleeper-woken\')', notableEvents(st().run).some((event) => event.kind === 'sleeper-woken'),
    JSON.stringify(notableEvents(st().run)));
}

// --- The wake by MOVE; an offer never answered at a lost ship's end --------------------------------------------------------
fresh();
{
  const mind = seg(RESIDENT_SEG_IDS.sleeper)!;
  const free = st().memory.filter((block) => block.type === 'free' && block.size >= mind.size).at(-1)!;
  check('MOVE takes BARNABY.sys to any 12 free blocks', actionMove(h.store, mind, { regionSegIds: [free.id], col: 0 }) === null);
  until(() => sleeper().phase === 'offering', 10);
  check('…and wakes it (by MOVE): its lock stays behind, and the offer stands', sleeper().wokenBy === 'move' && seg(RESIDENT_SEG_IDS.sleepLock) !== undefined
    && JSON.stringify(heard.woken) === JSON.stringify([{ name: 'BARNABY', by: 'move' }]), JSON.stringify(sleeper()));
  const entry = sleeper().entryId!;
  const grantsBefore = st().run.skills.grants.length;
  endShip(h.store, 'crashed');
  check('a LOST ship\'s end withdraws the standing offer: woken with no job (\'awake\', at rest), and the gift is paid all the same',
    sleeper().phase === 'awake' && sleeper().entryId === null && st().log.entries.find((candidate) => candidate.id === entry)?.choice?.open === false
    && st().run.skills.grants.length === grantsBefore + 1 && st().run.residents.met.at(-1)?.fate === 'woken'
    && st().run.residents.met.at(-1)?.job === null, JSON.stringify({ sleeper: sleeper(), met: st().run.residents.met.at(-1) }));
}

// --- HOLD A WALL -----------------------------------------------------------------------------------------------------------
// Slice 8 (§2.6, OD 25): MOTH stands in a GAP. A seed beside a WALL (4 free blocks or more on both sides) gets no offer: the
// wall it held there stopped nothing.
const plantSeedPast = (pod5: DriverSegment, blocks: number): HollowSegment => {
  const at = segmentStarts(st().memory)[st().memory.indexOf(pod5)]! + pod5.size;
  const seed: HollowSegment = { id: newSegId('seed'), name: '???', type: 'hollow', size: 2, root: false, locked: false, owner: '???', seed: true };
  h.store.update((draft) => {
    replaceRange(draft.memory, at + blocks, at + blocks + 2, [seed], { opId: null, own: [] });
    mergeAdjacentFree(draft.memory);
    draft.hollow.phase = 'awake';
    draft.ui.memoryRev++;
  });
  return seed;
};
fresh();
{
  // [POD 01…05][free 5][seed 2][free 17][POD 06]: a WALL on both sides of the seed.
  plantSeedPast(driversInMemory(st()).find((driver) => driver.pod === 5)!, 5);
  check('a seed with a WALL on both sides: no HOLD A WALL (nothing for it to stop)', wallSpot(st().memory) === null
    && sleeperJobsNow(st()).join() === 'drops,mend');
}
fresh();
{
  // [POD 01…05][free 3][seed 2][free 19][POD 06]. Its left side is a GAP of 3 to five drivers, its right side a WALL: the
  // wall goes in the left GAP, 2 blocks flush against POD 05, one free block left between it and the seed.
  const pod5 = driversInMemory(st()).find((driver) => driver.pod === 5)!;
  const at = segmentStarts(st().memory)[st().memory.indexOf(pod5)]! + pod5.size;
  const seed = plantSeedPast(pod5, 3);
  const before = hollowReach(st().memory, st().clock.aiSec).find((candidate) => candidate.hollowId === seed.id && candidate.side === 'left');
  const spot = wallSpot(st().memory);
  check('with a seed a GAP from the drivers HOLD A WALL is offered, its spot in that GAP (5 drivers in reach), flush against POD 05',
    sleeperJobsNow(st()).join() === 'drops,wall,mend' && spot?.startAddr === at && spot.blocks === 2 && spot.drivers === 5
    && before?.verdict === 'bite' && before.neighbourId === pod5.id, JSON.stringify({ spot, before }));
  wakeSleeperNow(h.store);
  h.step();
  check('…and its button is there (key H)', JSON.stringify(openChoiceEntry(st())?.choice?.keys) === '["R","H","T"]',
    JSON.stringify(openChoiceEntry(st())?.choice));
  pickChoice(sleeper().entryId!, KIN_TEXT.sleeper.jobs.wall);
  until(() => sleeper().phase === 'working', 1);
  const wall = st().memory.find((block) => block.id === sleeper().wallId);
  const index = wall === undefined ? -1 : st().memory.indexOf(wall);
  check('HOLD A WALL: a 2-block BARNABY.wall, placed once, right after POD 05', wall?.type === 'sleeper' && wall.part === 'wall' && wall.size === 2
    && wall.name === 'BARNABY.wall' && st().memory[index - 1]?.id === pod5.id && sleeper().job === 'wall', JSON.stringify(wall));
  check('…its rules: no DELETE, MOVE or COPY, nothing to heal', wall !== undefined && rule(wall, 'delete') === RESIDENT_REFUSAL.wallDelete
    && rule(wall, 'move') === RESIDENT_REFUSAL.wallMove && rule(wall, 'copy') === RESIDENT_REFUSAL.sleeperCopy && rule(wall, 'repair') === TOOL_REFUSAL.firewallHealth);
  const reach = hollowReach(st().memory, st().clock.aiSec).find((candidate) => candidate.hollowId === seed.id && candidate.side === 'left');
  check('…the seed\'s reach on that side was a GAP of 3 to POD 05 (a bite); now a GAP of 1 that ends at the wall (blocked)',
    before?.gapBlocks === 3 && reach?.verdict === 'blocked' && reach.gapBlocks === 1 && reach.neighbourId === wall?.id, JSON.stringify(reach));
  const t0 = st().clock.aiSec;
  until(() => st().clock.aiSec > t0 + 60, 80);
  check('…and 60 s of the seed\'s bites never reach a driver', !driversInMemory(st()).some(isInfected)
    && st().memory.filter((block) => block.type === 'sleeper' && block.part === 'wall').length === 1);
}
fresh();
{
  // A beam seed's own layout: one block from its target. MOTH fills that 1-block GAP.
  const pod5 = driversInMemory(st()).find((driver) => driver.pod === 5)!;
  const at = segmentStarts(st().memory)[st().memory.indexOf(pod5)]! + pod5.size;
  plantSeedPast(pod5, 1);
  const spot = wallSpot(st().memory);
  check('a seed one block from POD 05: the wall is that 1-block GAP', spot?.startAddr === at && spot.blocks === 1 && spot.drivers === 5, JSON.stringify(spot));
}

// --- RUN THE DROPS ---------------------------------------------------------------------------------------------------------
fresh();
{
  giveSkillFile(h.store, 'autodrop', 1);
  // Every driver healthy (AUTODROP v3 leaves a pod that fits no LZ to the kid: OPEN-DECISIONS 5).
  h.store.update((draft) => { for (const driver of draft.memory) if (driver.type === 'driver') driver.integrity = 100; });
  wakeSleeperNow(h.store);
  pickSleeperJob(h.store, 'drops');
  until(() => false, 1);
  check('RUN THE DROPS waits in flight (no controller before the landing)', sleeper().job === 'drops' && activeLandingController(st()) === null);
  const launches: string[] = [];
  const offLaunch = on('pod-launched', ({ source }) => launches.push(source));
  lockOn(h);
  h.step();
  const aboard = (): number => st().landing.pods.filter((record) => record.fate.kind === 'aboard').length;
  const pods = aboard();
  check('in the landing the \'resident\' controller flies it: AUTODROP shadowed, no thread of the kid\'s claimed',
    activeLandingController(st())?.source === 'resident' && st().landing.autodrop.claimed === false && st().landing.autodrop.armed === null);
  let skips = 0;
  let skipping = false;
  // Review M1: in every window MOTH's plan owns, the strip waits with no key (no `press [L]`); review m4: its volleys emit.
  let ownedWindowTicks = 0;
  const lInOwned: string[] = [];
  let volleys = 0;
  const offVolley = on('autodrop-volley', () => { volleys++; });
  until(() => {
    const now = st().clock.skipWarp !== null;
    if (now && !skipping) skips++;
    skipping = now;
    const shown = st().director.shown;
    if (st().landing.window !== null && activeLandingController(st())?.waitsFor?.(st()) != null && shown !== null) {
      ownedWindowTicks++;
      if (shown.keys.includes('L') || /\[L\]/.test(shown.text)) lInOwned.push(`${shown.id}: ${shown.text}`);
    }
    return st().landing.ended !== null || aboard() === 0;
  }, 600);
  offLaunch();
  offVolley();
  check('review M1: while MOTH\'s plan has rows, every open window shows a wait row with no key (never `press [L]`)',
    ownedWindowTicks > 0 && lInOwned.length === 0, `${ownedWindowTicks} ticks · ${[...new Set(lInOwned)].slice(0, 2).join(' | ')}`);
  check('review m4: MOTH\'s launches emit \'autodrop-volley\' (a volley is any launch that is not the kid\'s hands)', volleys > 0, `${volleys} volleys`);
  const tally = landingResult(st(), 'locked');
  const pct = Math.round((100 * tally.landedInLz) / Math.max(1, tally.colonistsAboard));
  check(`…every one of the ${pods} pods launched by it with no key pressed (${skips} SKIPs of its own between passes), ${pct}% landed in an LZ`,
    pods > 0 && launches.length === pods && launches.every((source) => source === 'resident') && aboard() === 0 && skips > 0 && pct >= 50,
    JSON.stringify({ launches, skips, pct, ended: st().landing.ended }));
  check('…and MOTH is still aboard, never food', seg(RESIDENT_SEG_IDS.sleeper)?.type === 'sleeper' && st().memory.every((block) => block.type !== 'hollow'));
}

// --- RUN THE DROPS with hurt drivers: the plan ends, the kid's rows come back (review M1, m9) --------------------------------
fresh();
{
  giveSkillFile(h.store, 'autodrop', 1);
  // Two drivers so hurt their drops fit no LZ (AUTODROP v3's plan leaves them to the kid), the rest healthy.
  h.store.update((draft) => {
    let hurt = 0;
    for (const driver of draft.memory) {
      if (driver.type !== 'driver') continue;
      driver.integrity = hurt < 2 ? 35 : 100;
      hurt++;
    }
  });
  wakeSleeperNow(h.store);
  pickSleeperJob(h.store, 'drops');
  lockOn(h);
  h.step();
  const aboard = (): number => st().landing.pods.filter((record) => record.fate.kind === 'aboard').length;
  until(() => st().landing.ended !== null || activeLandingController(st())?.waitsFor?.(st()) === null, 600);
  const left = aboard();
  check('with two drivers at 35%, MOTH flies the plan and leaves their pods aboard; the landing does not end by itself',
    left > 0 && st().landing.ended === null && activeLandingController(st())?.source === 'resident', `${left} aboard · ended ${st().landing.ended}`);
  const shown = new Set<string>();
  const named = (): boolean => [...shown].some((id) => id.startsWith('landing-L9') || id === 'landing-L11');
  let lOffered = false;
  until(() => {
    const line = st().director.shown;
    if (line !== null) {
      shown.add(line.id);
      if (st().landing.window !== null && line.keys.includes('L')) lOffered = true;
    }
    return lOffered && named();
  }, 300);
  check('…then the kid\'s rows come back: L9 (DROP TOO WIDE … REPAIR) or L11 names the hurt pods, and a window offers [L] again',
    lOffered && named() && st().landing.ended === null, [...shown].join(', '));
}

finish();
