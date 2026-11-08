// Phase 3 slice 2 (slice-2-plan §6.1, Track THREAT): HOLLOW's arrival folded with WALLS on VESPER ('arrives'), and LAST
// LIGHT's folded deal, from a constructed lock (harness-landing lockOn), never a flown approach.
// • VESPER: HOLLOW boarded on this beam and is silent until the loop closes; then one scripted bite on the driver beside
//   the root; the fight (no timed bite during it); `> ...047?` and CONTROL; a bite every 25 s from the fight's end at
//   3.5 %/s; at the first of them it names itself (`> hello 047…`, `> i was 046…`, the name flips, `decommissioned`);
//   in the landing `> i ran out…` and then `> keep 20 charge for me…` (risk 6); no two story lines type at once; the run remembers what it was told; a driver it eats is on run.threat.eatenDrivers.
// • LAST LIGHT on a run whose VESPER never got that far: its wake plays the notice and the naming first.
// • LAST LIGHT's folded DEAL: offered at the wake (before ORBIT LOCK); the verbs' clock stands still while it stands and
//   through the pause an ACCEPT buys, and runs again after a REFUSE. ORBIT LOCK withdraws a standing offer and ends the
//   pause (the review's M2): the duel runs with its verbs, and no deal UI stands beside FinaleChoice.
// • Slice 5 (plan R8, Track WARDEN): one deal per ship. On a ship whose corrupted resident already offered its own DEAL,
//   HOLLOW's waits: LAST LIGHT's folded DEAL is not offered at the wake (it comes on a later ship by its own rule).
import { check, finish } from '../wp1/harness';
import { createHarness7 } from '../wp7/harness7';
import { lockOn } from '../landing/harness-landing';
import { setLandingMode } from '../support/landing-instant';
import { typingSec } from '@systems/say';
import { actionRepair, actionDelete } from '@state/actions';
import { spreadPaused } from '@state/selectors';
import { getOps } from '@systems/ops-core';
import { hollowReach, theRoot, rootDeleteRunning } from '@systems/hollow';
import { verbsHeld, verbNow } from '@systems/hollow-verbs';
import { DEAL_ACCEPT, DEAL_REFUSE } from '@systems/hollow-deal';
import { pickChoice, openChoiceEntry } from '@systems/say';
import { hollowFirstFightDecided, keepChargeDue, copyLessonDue } from '@state/threat-selectors';
import { buildDirectorCtx } from '@systems/director';
import { getPrediction } from '@systems/predict';
import { GUIDE_RULES } from '@data/script';
import { createInitialState, createResidentState } from '@state/initial';
import { fixtureBoardedVerdict } from '../support/arm-ship';
import { installTool } from '@systems/licences';
import { HOLLOW_STORY, HOLLOW_DEAL } from '@data/hollow-text';
import { foldArrivalWalls } from '@data/threats';
import { MERGE_COST_CHARGE, DEAL_PAUSE_SEC } from '@data/tuning';
import type { GameState, LogEntry } from '@state/schema';
import type { DriverSegment } from '@/types/segment';
import { finaleAtStep1, settleFinale } from '../support/finale';

const VESPER = 3;
const LAST_LIGHT = 4;
const h = createHarness7(11, { soulsFound: true });
const s = (): Readonly<GameState> => h.store.getState();
const find = (speaker: string, text: string): LogEntry | undefined => s().log.entries.find((entry) => entry.speaker === speaker && entry.text === text);
// When each line ends typing on its screen (the screens type their lines one after another).
const typedEnd = (entry: LogEntry): number => {
  let typedBy = -Infinity;
  for (const other of s().log.entries) {
    if (other.channel !== entry.channel) continue;
    typedBy = Math.max(other.t, typedBy) + typingSec(other.speaker, other.text);
    if (other.id === entry.id) return typedBy;
  }
  throw new Error(`no log entry ${entry.id}`);
};
const typedStart = (entry: LogEntry): number => typedEnd(entry) - typingSec(entry.speaker, entry.text);
// The same state at a calm pace: the verbs' hold then says only what the deal does.
const atCruise = (state: Readonly<GameState>): GameState => ({ ...state, clock: { ...state.clock, pace: 'cruise' } }) as GameState;

// --- VESPER: the folded arrival ----------------------------------------------------------------------------------------
setLandingMode('manual');
// Track RETIRE: run 1's arm VESPER with HOLLOW forced aboard (the classic five's VESPER was the ship one hop from the final
// one; the arm's is CORMORANT): support/arm-ship fixtureBoardedVerdict.
h.shipAlone(VESPER, 11, { boarded: true });
installTool(h.store, 'repair');
check('VESPER plays ARRIVAL with WALLS folded in (\'arrives\'), a 10-block root in its slot, HOLLOW asleep',
  JSON.stringify(s().hollow.cfg) === JSON.stringify(foldArrivalWalls()) && s().memory.some((seg) => seg.type === 'hollow' && seg.root && seg.size === 10)
  && s().hollow.phase === 'asleep' && s().run.threat.aboard);
for (let i = 0; i < 200; i++) h.step();
check('…silent on the approach: no bite, no NEXT BITE clock, no story', s().hollow.phase === 'asleep' && s().hollow.biteInSec === null
  && s().hollow.story === 'none' && !hollowFirstFightDecided(s()));
lockOn(h);
let bitten: DriverSegment | null = null;
let biteTimerDuringFight = false;
for (let i = 0; i < 100 && bitten === null; i++) {
  h.step();
  bitten = s().memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.infected !== undefined) ?? null;
}
const root = s().memory.find((seg) => seg.type === 'hollow' && seg.root)!;
const beside = hollowReach(s().memory, s().clock.aiSec).filter((reach) => reach.hollowId === root.id).map((reach) => reach.neighbourId);
check('the loop closes: one scripted bite, on the nearer driver beside the root (the lead, POD 12 on the arm VESPER, across its GAP of 1)',
  bitten !== null && beside.includes(bitten.id) && bitten.pod === s().landing.lead
  && s().memory.filter((seg) => seg.type === 'driver' && seg.infected).length === 1 && s().hollow.scriptTargetId === bitten.id, bitten ? `POD ${bitten.pod}` : 'none');
check('…the fight is one-on-one: no bite timer runs during it, and it is not decided yet', s().hollow.biteInSec === null && !hollowFirstFightDecided(s()));
const target = bitten!;
// The kid lets it eat a while, then REPAIRs and wins.
for (let i = 0; i < 60; i++) { h.step(); if (s().hollow.biteInSec !== null) biteTimerDuringFight = true; }
actionRepair(h.store, s().memory.find((seg) => seg.id === target.id)!);
let decidedAt: number | null = null;
for (let i = 0; i < 600 && decidedAt === null; i++) {
  h.step();
  if (s().hollow.biteInSec !== null && decidedAt === null && s().hollow.scriptTargetId === null) decidedAt = s().clock.aiSec;
  if (s().hollow.biteInSec !== null && s().hollow.scriptTargetId !== null) biteTimerDuringFight = true;
}
check('the REPAIR wins the fight: decided, HOLLOW stays awake and its 25 s bite timer starts now',
  decidedAt !== null && !biteTimerDuringFight && s().hollow.phase === 'awake' && hollowFirstFightDecided(s()) && Math.abs(s().hollow.biteInSec! - 25) < 0.2,
  `decided ${decidedAt?.toFixed(1)}, timer ${s().hollow.biteInSec?.toFixed(2)}`);

// The story to its end (the report waits for it).
let firstBiteAt: number | null = null;
let helloSaidBeforeBite = false;
const hello = HOLLOW_STORY.hello(47, 36, [46]);
for (let i = 0; i < 3000 && s().hollow.story !== 'told'; i++) {
  h.step();
  h.defend();
  if (firstBiteAt === null && h.events.some((event) => event.name === 'hollow-bite' && event.wall > 0)) {
    const bite = h.events.filter((event) => event.name === 'hollow-bite');
    if (bite.length > 0) firstBiteAt = s().clock.aiSec;
  }
  if (firstBiteAt === null && find('hollow', hello) !== undefined) helloSaidBeforeBite = true;
}
const noticed = find('hollow', HOLLOW_STORY.noticed(47));
const control = find('control', HOLLOW_STORY.control);
const was = find('hollow', HOLLOW_STORY.wasUnit([46]));
const decommissioned = find('control', HOLLOW_STORY.decommissioned('UNIT-046'));
const ranOut = find('hollow', HOLLOW_STORY.ranOut);
const keepCharge = find('hollow', HOLLOW_STORY.keepCharge(47, MERGE_COST_CHARGE));
const story = [noticed, control, find('hollow', hello), was, decommissioned, ranOut, keepCharge];
check('the story, in order: `> ...047?`, CONTROL, `> hello 047…`, `> i was 046…`, decommissioned, `> i ran out…`, `> keep 16 charge for me…` (MERGE_COST_CHARGE)',
  story.every((entry) => entry !== undefined) && story.every((entry, index) => index === 0 || entry!.t >= story[index - 1]!.t),
  story.map((entry) => entry?.t.toFixed(1) ?? '—').join(' → '));
check('…the naming waits for the first timed bite after the fight (the walls lesson has it first)', !helloSaidBeforeBite && firstBiteAt !== null
  && find('hollow', hello)!.t >= firstBiteAt - 0.06, `bite ${firstBiteAt?.toFixed(1)}, hello ${find('hollow', hello)?.t.toFixed(1)}`);
let overlap = '';
for (let index = 1; index < story.length; index++) {
  const before = story[index - 1];
  const entry = story[index];
  if (before && entry && typedStart(entry) < typedEnd(before) - 1e-6) overlap = `${before.text} / ${entry.text}`;
}
check('…no story line starts typing before the one before it has typed', overlap === '', overlap);
check('…the name flipped (UNIT-046 on every hollow block) and the run remembers what it was told',
  s().run.hollowNamed && s().memory.filter((seg) => seg.type === 'hollow').every((seg) => seg.name === 'UNIT-046')
  && s().run.threat.told.noticed && s().run.threat.told.keepCharge && s().hollow.story === 'told');
check('…bites every 25 s at 3.5 %/s after the fight', s().hollow.cfg.spreadEverySec === 25 && s().hollow.cfg.drainPerSec === 3.5);

// A driver HOLLOW eats is recorded.
{
  const driver = s().memory.find((seg): seg is DriverSegment => seg.type === 'driver')!;
  const infect = s().memory.find((seg) => seg.id === driver.id) as DriverSegment;
  infect.integrity = 0.5;
  infect.infected = { side: 'left' };
  for (let i = 0; i < 20; i++) h.step();
  check('a driver HOLLOW eats goes on run.threat.eatenDrivers (slice 7\'s MERGE record)',
    s().run.threat.eatenDrivers.some((record) => record.pod === driver.pod && record.family === driver.family && record.shipId === s().level.shipId),
    JSON.stringify(s().run.threat.eatenDrivers));
}

// The review's minor 6: keepCharge is keyed on the current verdict's facts (run.threat.current), not on the story kind.
{
  const vesper = createInitialState({ seed: 3, shipIndex: VESPER, carried: 'fresh', threat: fixtureBoardedVerdict(VESPER, 3) });
  const lastLight = createInitialState({ seed: 3, shipIndex: LAST_LIGHT, carried: 'fresh' });
  const first = createInitialState({ seed: 3, shipIndex: 0 });
  const notOneHop = { ...vesper, run: { ...vesper.run, threat: { ...vesper.run.threat, current: { ...vesper.run.threat.current!, oneHopFromFinal: false } } } };
  const told = { ...vesper, run: { ...vesper.run, threat: { ...vesper.run.threat, told: { noticed: true, keepCharge: true } } } };
  check('minor 6: keepCharge is due where HOLLOW is aboard one hop from the final ship (VESPER), nowhere else, and once',
    keepChargeDue(vesper) && !keepChargeDue(notOneHop) && !keepChargeDue(lastLight) && !keepChargeDue(first) && !keepChargeDue(told)
    && first.run.threat.current?.stage === null && vesper.run.threat.current?.boards === 'forced', JSON.stringify(vesper.run.threat.current));
}

// --- LAST LIGHT on a run that never heard VESPER's beats ---------------------------------------------------------------
setLandingMode('instant');
h.shipAlone(LAST_LIGHT, 12);
installTool(h.store, 'repair');
h.events.length = 0;
check('LAST LIGHT folds THE DEAL in (run.stats.deal null) under its verbs', s().hollow.cfg.deal && s().hollow.cfg.verbs !== null && s().run.stats.deal === null);
let wokeAt: number | null = null;
let offeredAt: number | null = null;
let verbClockAtOffer: number | null = null;
let verbClockFrozen = true;
let heldWhileOffered = true;
for (let i = 0; i < 1600 && (offeredAt === null || s().clock.aiSec < offeredAt + 6); i++) {
  h.step();
  if (wokeAt === null && s().hollow.phase === 'awake') wokeAt = s().clock.aiSec;
  if (offeredAt === null && s().hollow.deal.phase === 'offered') {
    offeredAt = s().clock.aiSec;
    verbClockAtOffer = s().hollow.verbInSec;
  }
  if (offeredAt !== null && s().hollow.deal.phase === 'offered') {
    if (!verbsHeld(s())) heldWhileOffered = false;
    if (s().hollow.verbInSec !== verbClockAtOffer) verbClockFrozen = false;
  }
}
check('the deal is offered at the wake, before ORBIT LOCK', wokeAt !== null && offeredAt !== null && offeredAt - wokeAt < 0.2 && s().run.phase === 'flight',
  `wake ${wokeAt?.toFixed(1)}, offer ${offeredAt?.toFixed(1)}`);
check('…the verbs\' clock stands still while the offer stands', heldWhileOffered && verbClockFrozen && s().hollow.verb === null,
  `at offer ${verbClockAtOffer}, now ${s().hollow.verbInSec}`);
const entryId = s().hollow.deal.entryId!;
pickChoice(entryId, DEAL_ACCEPT);
for (let i = 0; i < 40; i++) h.step();
const pausedClock = s().hollow.verbInSec;
for (let i = 0; i < 200; i++) h.step();
check(`ACCEPT: the verbs wait out the pause too (${DEAL_PAUSE_SEC} s), whatever the pace`, s().run.stats.deal?.outcome === 'accepted'
  && verbsHeld(atCruise(s())) && s().hollow.verbInSec === pausedClock && s().hollow.verb === null, `${pausedClock} → ${s().hollow.verbInSec}`);
const afterPause = atCruise(s());
check('…and run again once it is over', !verbsHeld({ ...afterPause, clock: { ...afterPause.clock, aiSec: s().hollow.deal.pauseUntilAi! + 0.1 } }));
const missed = [find('hollow', HOLLOW_STORY.noticed(47)), find('control', HOLLOW_STORY.control), find('hollow', HOLLOW_STORY.hello(47, 36, [46])),
  find('hollow', HOLLOW_STORY.wasUnit([46])), find('control', HOLLOW_STORY.decommissioned('UNIT-046'))];
for (let i = 0; i < 600 && s().hollow.story === 'pending'; i++) h.step();
const missedNow = [find('hollow', HOLLOW_STORY.noticed(47)), find('control', HOLLOW_STORY.control), find('hollow', HOLLOW_STORY.hello(47, 36, [46])),
  find('hollow', HOLLOW_STORY.wasUnit([46])), find('control', HOLLOW_STORY.decommissioned('UNIT-046'))];
check('VESPER never got that far this run: LAST LIGHT\'s wake plays the notice and the naming first, in order',
  missedNow.every((entry) => entry !== undefined) && missedNow.every((entry, index) => index === 0 || entry!.t >= missedNow[index - 1]!.t)
  && s().run.hollowNamed && s().run.threat.told.noticed, `${missed.filter(Boolean).length} at the deal, ${missedNow.map((e) => e?.t.toFixed(1) ?? '—').join(' → ')}`);
check(`…and never \`> keep ${MERGE_COST_CHARGE} charge…\` there (VESPER's last beat)`, find('hollow', HOLLOW_STORY.keepCharge(47, MERGE_COST_CHARGE)) === undefined);

// A REFUSE lets the verbs run again at once.
h.shipAlone(LAST_LIGHT, 13);
installTool(h.store, 'repair');
for (let i = 0; i < 1600 && s().hollow.deal.phase !== 'offered'; i++) h.step();
check('…held by the offer itself, not by the pace (a calm flight would hold it too)', verbsHeld(atCruise(s())));
pickChoice(s().hollow.deal.entryId!, DEAL_REFUSE);
for (let i = 0; i < 4; i++) h.step();
check('REFUSE: `> ok.`, and nothing of the deal holds the verbs any more', s().run.stats.deal?.outcome === 'refused'
  && find('hollow', HOLLOW_DEAL.ok) !== undefined && !verbsHeld(atCruise(s())));

// The review's M2: ACCEPT 10 s before ORBIT LOCK. The pause ends at the lock (the duel is never unopposed), the verbs
// resume there with the first verb's lesson timing, and no deal UI ever stands beside FinaleChoice.
{
  h.shipAlone(LAST_LIGHT, 14);
  installTool(h.store, 'repair');
  installTool(h.store, 'delete');
  for (let i = 0; i < 1600 && s().hollow.deal.phase !== 'offered'; i++) h.step();
  pickChoice(s().hollow.deal.entryId!, DEAL_ACCEPT);
  const acceptAi = s().clock.aiSec;
  for (let i = 0; i < 400 && s().clock.aiSec < acceptAi + 10; i++) h.step();
  const pausedAtLock = spreadPaused(s().hollow, s().clock.aiSec) && verbsHeld(atCruise(s()));
  lockOn(h);
  h.step();
  check('M2: ACCEPT 10 s before the lock: the pause stood until the lock and ends there (no bite, seed or verb waits on it)',
    pausedAtLock && s().run.phase === 'landing' && s().hollow.finale.phase === 'duel' && !spreadPaused(s().hollow, s().clock.aiSec) && !verbsHeld(s()),
    `${s().run.phase} ${s().hollow.finale.phase} pause to ${s().hollow.deal.pauseUntilAi?.toFixed(1)} at ${s().clock.aiSec.toFixed(1)}`);
  const clockAtLock = s().hollow.verbInSec;
  let firstVerb: { totalSec: number; afterLockSec: number } | null = null;
  const lockAi = s().clock.aiSec;
  for (let i = 0; i < 400 && firstVerb === null; i++) {
    h.step();
    const verb = s().hollow.verb;
    if (verb !== null) firstVerb = { totalSec: verb.totalSec, afterLockSec: s().clock.aiSec - lockAi };
  }
  const verbs = s().hollow.cfg.verbs!;
  check(`…the verbs resume at the lock: the ship's first verb comes in the duel with the lesson's ${verbs.firstTelegraphSec} s count, not on the lock's tick`,
    clockAtLock !== null && firstVerb !== null && firstVerb.totalSec === verbs.firstTelegraphSec && firstVerb.afterLockSec > 1,
    `clock ${clockAtLock?.toFixed(1)} at the lock, ${JSON.stringify(firstVerb)}`);
  // An offer still standing at the lock is withdrawn there.
  h.shipAlone(LAST_LIGHT, 15);
  installTool(h.store, 'repair');
  installTool(h.store, 'delete');
  for (let i = 0; i < 1600 && s().hollow.deal.phase !== 'offered'; i++) h.step();
  const standing = s().hollow.deal.entryId!;
  lockOn(h);
  let coexisted = false;
  h.step();
  check('…an offer still standing at the lock is withdrawn there, silently (\'invalidated\'), its buttons gone',
    s().hollow.deal.phase === 'done' && s().run.stats.deal?.outcome === 'invalidated' && openChoiceEntry(s()) === null
    && s().log.entries.find((entry) => entry.id === standing)?.choice?.open === false, `${s().hollow.deal.phase} ${s().run.stats.deal?.outcome}`);
  // To the choice: the root's DELETE, its verbs blocked or not; the deal's buttons never come back.
  for (let i = 0; i < 3000 && s().hollow.finale.phase === 'duel'; i++) {
    const root = theRoot(s().memory);
    if (root !== null && !root.locked && !rootDeleteRunning(s()) && getOps().length === 0) actionDelete(h.store, root);
    h.step();
    if (openChoiceEntry(s()) !== null || s().hollow.deal.phase === 'offered') coexisted = true;
  }
  // Slice 7a (R6): the root's fall puts HOLLOW to sleep and the landing goes on; the card comes up once it has settled.
  settleFinale(h.store, () => {
    h.step();
    if (openChoiceEntry(s()) !== null || s().hollow.deal.phase === 'offered') coexisted = true;
  });
  check('…and the duel runs to FinaleChoice with no deal UI beside it', finaleAtStep1(s()) && !coexisted
    && openChoiceEntry(s()) === null && s().hollow.deal.phase === 'done', `${s().hollow.finale.phase}`);
}

// The review's minor 5: the COPY lesson on the fixed five fires on LAST LIGHT's first `unlink` of Repair's last spare.
{
  setLandingMode('manual');
  h.shipAlone(LAST_LIGHT, 16);
  installTool(h.store, 'repair');
  installTool(h.store, 'copy');
  for (let i = 0; i < 1600 && s().hollow.deal.phase !== 'offered'; i++) h.step();
  pickChoice(s().hollow.deal.entryId!, DEAL_REFUSE);
  // The harness's flight stands at TACTICAL (the verbs wait for a calm flight): the duel's landing runs them at once.
  lockOn(h);
  const lessonLive = (): boolean => {
    const ctx = buildDirectorCtx(s(), getPrediction(), { events: new Set(), phaseEntered: null, mindQuietSec: 0, flash: null });
    return GUIDE_RULES.some((rule) => rule.lesson === 'copy-repair' && rule.activeWhen(ctx));
  };
  const before = copyLessonDue(s()) || lessonLive();
  let unlinked: string | null = null;
  for (let i = 0; i < 3000 && unlinked === null; i++) {
    if (s().hollow.verb === null && s().hollow.phase === 'awake') verbNow(h.store);
    h.step();
    const verb = s().hollow.verb;
    if (verb?.kind === 'rm' && /repair/i.test(verb.targetWord)) unlinked = verb.targetWord;
  }
  check('minor 5: no COPY lesson on LAST LIGHT before a verb aims at Repair\'s spare; `unlink repair.bak` makes it due',
    !before && unlinked !== null && s().hollow.unlinkedLastSpare && copyLessonDue(s()), `${unlinked}`);
  for (let i = 0; i < 200 && s().hollow.verb !== null; i++) h.step();
  check('…and it stays due once the verb is over, so the lesson follows BLOCK IT on the strip', s().hollow.verb === null && copyLessonDue(s()) && lessonLive());
}

// Slice 5 (plan R8): LAST LIGHT on the seed whose wake offers the folded DEAL (13, above), with a corrupted resident's DEAL
// already settled on it (its file deleted: only the ship's one deal is left of it). HOLLOW wakes and bites, and offers none.
{
  setLandingMode('instant');
  h.shipAlone(LAST_LIGHT, 13);
  installTool(h.store, 'repair');
  h.store.update((draft) => {
    draft.resident = createResidentState({ kind: 'corrupted', shown: 'faulty', name: 'WARDEN', fragments: 0 });
    draft.resident.corrupted!.phase = 'deleted';
    draft.resident.corrupted!.deal = { phase: 'done', fileId: null, fileName: null, entryId: null, outcome: 'refused' };
  });
  let wokeAtStep: number | null = null;
  for (let i = 0; i < 1600 && (wokeAtStep === null || i < wokeAtStep + 120); i++) {
    h.step();
    if (wokeAtStep === null && s().hollow.phase === 'awake') wokeAtStep = i;
  }
  check('one deal per ship (R8): a resident\'s DEAL settled on LAST LIGHT, HOLLOW wakes and offers none of its own',
    wokeAtStep !== null && s().hollow.deal.phase === 'none' && s().run.stats.deal === null && openChoiceEntry(s()) === null,
    `${s().hollow.phase} ${s().hollow.deal.phase}`);
  h.store.update((draft) => { draft.resident = createResidentState(null); });
}

finish();
