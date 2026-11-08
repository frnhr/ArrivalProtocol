// Phase 3 slice 2: VESPER plays ARRIVAL + WALLS on the fixed five, so these deal mechanics run on the HUNT stage (harness10
// `hunt`: phase 2's VESPER def, its 14-block root in the slot). The slot puts the root between POD 08 (GAP 2) and POD 09
// (GAP 1): the nearer is POD 09 now, so the old C08 and C09 roles below are swapped. LAST LIGHT's folded deal is
// tests/unit/threat/arrival-story.test.ts.
// Slice 1a: VESPER keeps phase 2's racks with `C` → `P`, so POD 08 and POD 09 stand where C08 and C09 did (the old
// codes below name those pods: tests/unit/support/pod-code.ts); a deal is invalidated when the named pod launches.
// WP10 acceptance 3 (§9 WP10, §6.6 THE DEAL), headless on VESPER with every DOM-free system (harness10):
// • the trigger: once HOLLOW wakes and bites C08 (a 1-block GAP) and C09 (3), a front stands within 3 free blocks of a
//   cluster with ≥ 3 clusters left: the offer comes at once, naming the nearer (C08), typing right after the bite's
//   echoes, in the TERMINAL with ACCEPT / REFUSE; its 15 s timer starts once the line has typed, runs on AI
//   time (a burn changes nothing; pause freezes it, and a pick while paused is refused);
// • ACCEPT: the named cluster is eaten at once (did not wake), every infection is cured, the spread stands still for
//   60 AI s (no bite, no seed), CONTROL's line, run.stats.deal = accepted;
// • REFUSE: `> ok.`, NEXT BITE drops to ×0.8 at once and the bites come every 12.8 s for 30 s, then every 16 s again;
//   run.stats.deal = refused; the timer running out does the same (timeout);
// • invalidated when the named pod launches, or its driver moves (`> never mind.`, the buttons go dead, no handler);
// • never offered twice (the same ship with fronts standing after, and a run that already had its deal).
// WP10 review fixes (round 1), each commented below: HOLLOW holds the named cluster while the offer stands (its drain
// stands still, no eaten alarm on it, the other bites drain on), so an unanswered offer ends in the timeout's cost; an
// ACCEPT leaves the seed clock alone (the first seed still waits for a calm flight after the pause) and a telegraph it
// calls off comes back DEAL_SEED_CALLED_OFF_SEC after the pause, also held by a burn; an offer the ship's end cuts
// short is recorded (invalidated).
import '../support/classic-world';
import { check, finish } from '../wp1/harness';
import { byDepth } from '../depth';
import { createHarness10 } from './harness10';
import { pickChoice, entryTypedAtAi } from '@systems/say';
import { offerDealNow, dealFront, DEAL_ACCEPT, DEAL_REFUSE } from '@systems/hollow-deal';
import { cureNow, hollowReach } from '@systems/hollow';
import { actionMove } from '@state/actions';
import { podRecord } from '@systems/landing-rules';
import { setLoadNext } from '@systems/landing';
import { playerLaunch } from '@systems/landing-controls';
import { isPodCode } from '../support/pod-code';
import { setLandingMode } from '../support/landing-instant';
import { endFlight } from '@systems/orbit-sim';
import { setPaused } from '@systems/clock';
import { driversInMemory, isInfected } from '@state/selectors';
import { getOps } from '@systems/ops-core';
import { HOLLOW_DEAL } from '@data/hollow-text';
import type { DriverSegment, FreeSegment } from '@/types/segment';
import { EATEN_ALERT_PREFIX } from '@systems/alerts';
import {
  DEAL_TIMEOUT_SEC, DEAL_PAUSE_SEC, DEAL_HASTE_SEC, DEAL_REFUSE_INTERVAL_FACTOR, DEAL_SEED_CALLED_OFF_SEC, SEED_TELEGRAPH_SEC,
} from '@data/tuning';

const h = createHarness10(5);
const state = () => h.store.getState();
const SPREAD = 16;

function dealEntry() {
  const id = state().hollow.deal.entryId;
  return id === null ? undefined : state().log.entries.find((entry) => entry.id === id);
}

function soul(code: string): DriverSegment | undefined {
  return driversInMemory(state()).find((candidate) => isPodCode(candidate.pod, code));
}

// HOLLOW's wake brought to now (the slice 2 review's tier trim): the HUNT stage wakes 30 AI s into the coast, and only
// the first scenario below flies that coast; the rest build the awake state directly (as threat/arrival-story's lockOn
// builds the lock), so the deal's own rules are what they spend their ticks on.
function wakeNow(): void {
  h.store.update((d) => { d.hollow.cfg.wake = { afterAiSec: d.clock.aiSec, coastLeadSec: null }; });
}

// VESPER until the deal is offered: its wake brought to now, the bites and the offer on the next ticks.
function toOffer(seed: number): void {
  h.vesper(seed, { hunt: true });
  wakeNow();
  h.stepUntil(() => state().hollow.phase === 'awake', 5);
  h.stepUntil(() => state().hollow.deal.phase === 'offered', 30);
}

// --- The trigger and the offer -------------------------------------------------------------------------------------
{
  h.vesper(5, { hunt: true });
  check('VESPER: no deal before HOLLOW wakes', state().hollow.deal.phase === 'none' && dealFront(state().memory, 0)?.pod === 9);
  h.stepUntil(() => state().hollow.phase === 'awake', 60);
  const wokeAt = state().clock.aiSec;
  check('HOLLOW wakes on the coast and bites C09 and C08', isInfected(soul('C09')!) && isInfected(soul('C08')!), `at ${wokeAt.toFixed(1)} AI s`);
  h.stepUntil(() => state().hollow.deal.phase === 'offered', 30);
  const offeredAfter = state().clock.aiSec - wokeAt;
  const entry = dealEntry()!;
  const log = state().log.entries;
  const echoAt = log.findIndex((line) => line.speaker === 'hollow' && line.text.startsWith('> infect pod09'));
  check('…and offers the deal at once: its line types right after the bite\'s echoes (the TERMINAL types in order)',
    state().hollow.deal.phase === 'offered' && offeredAfter <= 0.1 && echoAt >= 0 && log.indexOf(entry) > echoAt
    && entryTypedAtAi(state(), entry.id) > entryTypedAtAi(state(), log[echoAt]!.id), `${offeredAfter.toFixed(2)} s after the wake`);
  check('…naming the pod at its front (POD 09, the nearer)', state().hollow.deal.pod === 9
    && entry.text === HOLLOW_DEAL.offer('POD 09') && entry.text === '> give me POD 09. then i leave the others alone. for a while.', entry.text);
  check('…in the TERMINAL (HOLLOW), with ACCEPT and REFUSE and a 15 s timer', entry.speaker === 'hollow' && entry.channel === 'mind'
    && JSON.stringify(entry.choice?.options) === JSON.stringify([DEAL_ACCEPT, DEAL_REFUSE]) && entry.choice?.timeoutAiSec === DEAL_TIMEOUT_SEC);
  const typedAt = entryTypedAtAi(state(), entry.id);
  h.stepUntil(() => state().clock.aiSec >= typedAt - 0.2, 10);
  check('…its timer stands still while the line types', entry.choice!.leftAiSec === DEAL_TIMEOUT_SEC, `${entry.choice!.leftAiSec}`);
  h.stepUntil(() => state().clock.aiSec >= typedAt + 3, 10);
  check('…then counts down on AI time', Math.abs(entry.choice!.leftAiSec - (DEAL_TIMEOUT_SEC - 3)) < 0.06, entry.choice!.leftAiSec.toFixed(2));
  // Pause freezes it; a pick while paused is refused and the choice still stands.
  setPaused(h.store, true);
  const left = entry.choice!.leftAiSec;
  h.stepFor(2);
  check('pause freezes the timer, and a pick while paused is refused', entry.choice!.leftAiSec === left
    && pickChoice(entry.id, DEAL_ACCEPT) === false && entry.choice!.open, left.toFixed(2));
  setPaused(h.store, false);

  // --- ACCEPT --------------------------------------------------------------------------------------------------
  check('ACCEPT picked', pickChoice(entry.id, DEAL_ACCEPT));
  h.step();
  h.step();
  const pausedAt = state().clock.aiSec;
  const biteIn = state().hollow.biteInSec;
  check('ACCEPT: POD 09\'s driver is eaten at once (its pod parked later, eaten)', soul('C09') === undefined
    && podRecord(state(), 9).driverLost === 'eaten');
  check('…a hollow block stands where POD 09\'s driver was (it remembers the pod)', state().memory.some((seg) => seg.type === 'hollow' && seg.atePod === 9));
  check('…every infection is cured (C08 too)', !state().memory.some((seg) => isInfected(seg)) && soul('C08')!.recoilUntilAi !== undefined);
  check('…CONTROL: "Negotiating with unauthorized processes is not recommended. :)"', state().log.entries.some((line) => line.text === HOLLOW_DEAL.control));
  const deal = state().run.stats.deal;
  check('…run.stats.deal records it', deal?.outcome === 'accepted' && deal.pod === 9
    && deal.shipId === 'vesper' && state().hollow.deal.phase === 'done');
  // The pause: 60 AI s with no bite (NEXT BITE stands still) and no seed.
  const eventsFrom = h.events.length;
  h.stepUntil(() => state().clock.aiSec >= pausedAt + DEAL_PAUSE_SEC - 0.5, DEAL_PAUSE_SEC + 2);
  const bitten = h.events.slice(eventsFrom).filter((event) => event.name === 'hollow-bite').length;
  const telegraphs = h.events.slice(eventsFrom).filter((event) => event.name === 'seed-telegraph').length;
  check(`…for ${DEAL_PAUSE_SEC} AI s nothing bites and no seed comes (NEXT BITE stands still)`, bitten === 0 && telegraphs === 0
    && state().hollow.biteInSec === biteIn, `bites ${bitten}, telegraphs ${telegraphs}, NEXT BITE ${biteIn?.toFixed(2)} → ${state().hollow.biteInSec?.toFixed(2)}`);
  h.stepUntil(() => state().clock.aiSec >= pausedAt + DEAL_PAUSE_SEC + (biteIn ?? 0) + 0.5, 30);
  check('…then the bites come again', h.events.slice(eventsFrom).some((event) => event.name === 'hollow-bite'));
  // Never twice on this ship: fronts stand (the eaten C09 is now hollow next to C07), and no offer comes.
  const offers = h.events.filter((event) => event.name === 'deal-offered').length;
  h.stepFor(30);
  check('…never offered twice (fronts still stand, 30 s later)', h.events.filter((event) => event.name === 'deal-offered').length === offers
    && state().hollow.deal.phase === 'done', `front ${dealFront(state().memory, state().clock.aiSec)?.pod ?? 'none'}`);
}

// --- REFUSE ---------------------------------------------------------------------------------------------------------
{
  toOffer(6);
  const entry = dealEntry()!;
  h.stepUntil(() => state().clock.aiSec >= entryTypedAtAi(state(), entry.id) + 1, 10);
  const biteBefore = state().hollow.biteInSec!;
  pickChoice(entry.id, DEAL_REFUSE);
  h.step();
  const refusedAt = state().clock.aiSec;
  const biteAfter = state().hollow.biteInSec!;
  check('REFUSE: `> ok.`', state().log.entries.some((line) => line.speaker === 'hollow' && line.text === HOLLOW_DEAL.ok));
  check('…NEXT BITE drops at once (×0.8: the refusal\'s cost, seen)', Math.abs(biteAfter - (biteBefore - 0.05) * DEAL_REFUSE_INTERVAL_FACTOR) < 0.06,
    `${biteBefore.toFixed(2)} → ${biteAfter.toFixed(2)}`);
  const deal = state().run.stats.deal;
  check('…run.stats.deal = refused', deal?.outcome === 'refused' && deal.pod === 9);
  // The bite times: every 12.8 s within the 30 s, then every 16 s.
  const biteTimes: number[] = [];
  const from = h.events.length;
  h.stepUntil(() => state().clock.aiSec >= refusedAt + DEAL_HASTE_SEC + 2 * SPREAD + 1, 120);
  for (const event of h.events.slice(from)) if (event.name === 'hollow-bite') biteTimes.push(event.wall);
  const gaps = biteTimes.slice(1).map((time, i) => +(time - biteTimes[i]!).toFixed(2));
  const hastedGap = SPREAD * DEAL_REFUSE_INTERVAL_FACTOR;
  check(`…the bites come every ${hastedGap} s while the haste lasts, then every ${SPREAD} s`,
    gaps.length >= 2 && Math.abs(gaps[0]! - hastedGap) < 0.06 && Math.abs(gaps[gaps.length - 1]! - SPREAD) < 0.06, gaps.join(', '));
}

// --- The timer running out -------------------------------------------------------------------------------------------
{
  // The bites are cured at once (a kid repairing them): unrepaired, HOLLOW eats C09 within the timer (below).
  toOffer(7);
  cureNow(h.store, soul('C09')!);
  cureNow(h.store, soul('C08')!);
  const entry = dealEntry()!;
  const typedAt = entryTypedAtAi(state(), entry.id);
  h.stepUntil(() => state().hollow.deal.phase === 'done', DEAL_TIMEOUT_SEC + 15);
  const endedAt = state().clock.aiSec;
  check('the timer runs out 15 AI s after the line has typed: `> ok.`, haste, run.stats.deal = timeout',
    state().run.stats.deal?.outcome === 'timeout' && Math.abs(endedAt - (typedAt + DEAL_TIMEOUT_SEC)) < 0.15
    && state().hollow.deal.hasteUntilAi !== null && !entry.choice!.open && entry.choice!.picked === null,
    `ended ${(endedAt - typedAt).toFixed(2)} s after typed`);
}

// --- Unanswered and unrepaired: HOLLOW holds C09 for the answer (WP10 review fix) ------------------------------------
// Before the fix HOLLOW's drain ran on through the offer and ate C09 before the 15 s were up on 6 of 8 seeds (`> never
// mind. i took it.`), so the timeout's cost almost never came, and the strip's `C09 WILL BE EATEN IN 0:08` contradicted
// the offer's clock. Now the offer's clock is the one clock on C09.
{
  let timedOut = 0;
  let held = 0;
  let noAlarm = 0;
  let othersDrain = 0;
  const seeds = byDepth([7, 13], [7, 13, 14, 15]);
  for (const seed of seeds) {
    toOffer(seed);
    const entry = dealEntry()!;
    const c09At = soul('C09')!.integrity;
    const c08At = soul('C08')!.integrity;
    let alarmed = false;
    h.stepUntil(() => {
      if (state().alerts.list.some((alert) => alert.id === `${EATEN_ALERT_PREFIX}9`)) alarmed = true;
      return state().hollow.deal.phase === 'done';
    }, DEAL_TIMEOUT_SEC + 15);
    if (state().run.stats.deal?.outcome === 'timeout' && !entry.choice!.open) timedOut++;
    // At the timeout C09 is where it stood when the offer came (the drain resumes from the next tick).
    if (soul('C09') !== undefined && Math.abs(soul('C09')!.integrity - c09At) < 1e-9) held++;
    if (!alarmed) noAlarm++;
    if (soul('C08') === undefined || soul('C08')!.integrity < c08At - 10) othersDrain++;
  }
  check(`unanswered and unrepaired, every offer ends in the timeout (\`> ok.\`, its haste), C09 alive (${seeds.length} seeds)`,
    timedOut === seeds.length, `${timedOut}/${seeds.length}`);
  check('…HOLLOW held C09 the whole time (its integrity stood still) and never raised `C09 WILL BE EATEN`',
    held === seeds.length && noAlarm === seeds.length, `held ${held}, no alarm ${noAlarm}`);
  check('…while the other bite (C08) drained on', othersDrain === seeds.length, `${othersDrain}/${seeds.length}`);
}

// --- Invalidated: the named driver moves ------------------------------------------------------------------------
{
  toOffer(8);
  const entry = dealEntry()!;
  // C09 is being eaten (a MOVE is refused on it): heal it at once, then MOVE it behind a WALL in rack D.
  cureNow(h.store, soul('C09')!);
  const free = state().memory.filter((seg): seg is FreeSegment => seg.type === 'free' && seg.reservedBy === undefined).sort((a, b) => b.size - a.size)[0]!;
  const moved = actionMove(h.store, soul('C09')!, { regionSegIds: [free.id], col: free.size - 8 });
  h.step();
  h.step();
  check('a MOVE of the named driver withdraws the offer: `> never mind.`, the buttons go dead, run.stats.deal = invalidated',
    moved === null && state().run.stats.deal?.outcome === 'invalidated' && !entry.choice!.open && entry.choice!.picked === null
    && state().log.entries.some((line) => line.text === HOLLOW_DEAL.neverMind), `${moved} ${state().run.stats.deal?.outcome}`);
  check('…and a late pick does nothing', pickChoice(entry.id, DEAL_ACCEPT) === false && soul('C09') !== undefined);
  while (getOps().length > 0) h.step();
}

// --- Invalidated: the named pod launches ----------------------------------------------------------------------------
// The kid puts POD 09 first (LOAD NEXT) and presses [L] in an LZ window (landing-controls playerLaunch, the key's own
// path): only POD 09 goes. The offer's 15 AI s are shorter than the wait for VESPER's first window, so it is made in the
// window (offerDealNow), with HOLLOW asleep so nothing else touches POD 09 meanwhile.
{
  h.vesper(9, { hunt: true, hollowAsleep: true });
  // Slice 1b (risk 5): the engine is open in landing, and VESPER's failing Thrust Ctrl fires there too; unswapped, its
  // bursts sink the orbit before the first window. This kid SWAPped it in flight, as the tutorial asks.
  h.store.update((draft) => {
    for (const seg of draft.memory) if (seg.role === 'thrust-ctrl' && 'integrity' in seg) seg.integrity = 100;
  });
  setLandingMode('manual');
  h.startLanding(1);
  h.stepUntil(() => state().landing.window !== null, 300);
  offerDealNow(h.store, soul('C09')!);
  h.step();
  const entry = dealEntry()!;
  check('an offer in the landing, in an LZ window (named POD 09)', state().run.phase === 'landing' && state().landing.window !== null
    && entry.choice?.open === true && state().hollow.deal.pod === 9);
  const loadNext = setLoadNext(h.store, 9);
  const launch = playerLaunch(h.store, (_text, onYes) => onYes());
  h.step();
  const fate = podRecord(state(), 9).fate;
  const others = state().landing.pods.filter((record) => record.pod !== 9 && record.fate.kind !== 'aboard').map((record) => record.pod);
  check('…LOAD NEXT POD 09, then [L]: POD 09 launches alone, and the offer is withdrawn (invalidated)',
    loadNext === null && launch.kind === 'launched' && launch.pod === 9 && soul('C09') === undefined
    && (fate.kind === 'down' || fate.kind === 'falling') && others.length === 0
    && state().run.stats.deal?.outcome === 'invalidated' && !entry.choice!.open,
    `${loadNext ?? 'pinned'}, ${launch.kind}, POD 09 ${fate.kind}, others away ${others.join(',') || 'none'}, deal ${state().run.stats.deal?.outcome}`);
  setLandingMode('instant');
}

// --- Never twice in a run; a deal during a burn ---------------------------------------------------------------------
{
  h.vesper(10, { hunt: true });
  h.store.update((d) => { d.run.stats.deal = { outcome: 'refused', pod: 8, shipId: 'vesper' }; });
  wakeNow();
  h.stepUntil(() => state().hollow.phase === 'awake', 5);
  h.stepFor(15);
  check('a run that already had its deal is never offered another', state().hollow.deal.phase === 'none'
    && dealFront(state().memory, state().clock.aiSec) !== null);

  h.vesper(11, { hunt: true });
  // The kid brakes early (TOO EARLY): thrust is delivered when the offer comes; it is said at once, and its timer runs.
  h.stepFor(1);
  h.keyDown('Space');
  h.stepUntil(() => state().burn.lastTickDvKmS > 0, 5);
  offerDealNow(h.store, soul('C09')!);
  const entry = dealEntry()!;
  const typedAt = entryTypedAtAi(state(), entry.id);
  h.stepUntil(() => state().clock.aiSec >= typedAt + 2, 15);
  const firing = state().burn.lastTickDvKmS > 0;
  h.keyUp('Space');
  check('a deal during a burn: the offer is in the TERMINAL at once and its timer runs on AI time while the engine fires',
    firing && Math.abs(entry.choice!.leftAiSec - (DEAL_TIMEOUT_SEC - 2)) < 0.06, `${firing} ${entry.choice!.leftAiSec.toFixed(2)}`);
}

// --- ACCEPT and the seeds (WP10 review fix) --------------------------------------------------------------------------
// Before the fix an ACCEPT zeroed the seed clock, and VESPER's first seed (25 s after the wake; the deal comes at the
// wake) telegraphed on the first tick after the pause, whatever the flight was doing: under a burn's NOW line too.
// Holds SPACE (TOO EARLY: a burn at TACTICAL) from `fromAi` for `forSec`; true when a seed telegraph started meanwhile.
function telegraphWhileBurning(fromAi: number, forSec: number): boolean {
  h.stepUntil(() => state().clock.aiSec >= fromAi, 200);
  h.keyDown('Space');
  let seen = false;
  const end = state().clock.aiSec + forSec;
  while (state().clock.aiSec < end) {
    h.step();
    if (state().hollow.seedTelegraph !== null && state().clock.pace === 'tactical') seen = true;
  }
  h.keyUp('Space');
  return seen;
}

{
  let clockKept = 0;
  let waited = 0;
  const seeds = byDepth([1], [1, 2, 3]);
  for (const seed of seeds) {
    const before = (toOffer(seed), state().hollow.seedInSec);
    const id = state().hollow.deal.entryId!;
    h.stepUntil(() => state().clock.aiSec >= entryTypedAtAi(state(), id) + 1, 20);
    pickChoice(id, DEAL_ACCEPT);
    h.step();
    if (before !== null && state().hollow.seedInSec === before && state().hollow.seedMoments === 0) clockKept++;
    // The first seed's clock runs out 25 s after the pause: a kid burning across that moment holds it back (WP9).
    const dueAt = state().hollow.deal.pauseUntilAi! + before!;
    if (!telegraphWhileBurning(dueAt - 1, 5)) waited++;
  }
  check('ACCEPT before the first seed leaves the seed clock where it stood (not zeroed)', clockKept === seeds.length, `${clockKept}/${seeds.length}`);
  check('…and the first seed still waits while a burn holds the flight at TACTICAL, after the pause', waited === seeds.length, `${waited}/${seeds.length}`);
}

{
  // A first seed's telegraph blinking when ACCEPT lands is called off: taken back (still the first seed), back
  // DEAL_SEED_CALLED_OFF_SEC of running seed clock after the pause, and held by a burn like any first seed.
  toOffer(4);
  h.store.update((d) => {
    const spot = d.memory.findIndex((seg) => seg.type === 'free' && seg.size >= 8);
    let addr = 0;
    for (let i = 0; i < spot; i++) addr += d.memory[i]!.size;
    d.hollow.seedTelegraph = { startAddr: addr + 2, size: 2, leftSec: SEED_TELEGRAPH_SEC, preempted: false };
    d.hollow.seedMoments = 1;
    d.hollow.seedInSec = 40;
  });
  const id = state().hollow.deal.entryId!;
  pickChoice(id, DEAL_ACCEPT);
  h.step();
  check('ACCEPT calls off a blinking telegraph: no outline, the moment taken back, its clock at DEAL_SEED_CALLED_OFF_SEC',
    state().hollow.seedTelegraph === null && state().hollow.seedMoments === 0 && state().hollow.seedInSec === DEAL_SEED_CALLED_OFF_SEC,
    `${state().hollow.seedMoments} ${state().hollow.seedInSec}`);
  const pauseEnd = state().hollow.deal.pauseUntilAi!;
  check('…and the seed it called off waits for a calm flight after the pause too',
    !telegraphWhileBurning(pauseEnd + DEAL_SEED_CALLED_OFF_SEC - 1, 5));
}

// --- The ship ends with the offer standing (WP10 review fix) ------------------------------------------------------
{
  toOffer(16);
  const entry = dealEntry()!;
  endFlight(h.store, 'crashed');
  h.step();
  check('an offer the ship\'s end cuts short is withdrawn and recorded (run.stats.deal = invalidated)', !entry.choice!.open
    && state().hollow.deal.phase === 'done' && state().run.stats.deal?.outcome === 'invalidated' && state().run.stats.deal?.pod === 9,
    JSON.stringify(state().run.stats.deal));
}

// The reach a front is measured with (DEAL_FRONT_BLOCKS): VESPER's root sees POD 08 across 2 blocks and POD 09 across 1.
{
  h.vesper(12, { hunt: true });
  const reach = hollowReach(state().memory, 0).filter((entry) => entry.neighbourId?.startsWith('driver_'));
  check('VESPER\'s root: POD 08 across a 2-block GAP, POD 09 across 1 (both at its front)',
    reach.map((entry) => `${entry.neighbourId}:${entry.gapBlocks}`).join(',') === 'driver_pod08:2,driver_pod09:1',
    reach.map((entry) => `${entry.neighbourId}:${entry.gapBlocks}`).join(','));
}

finish();
