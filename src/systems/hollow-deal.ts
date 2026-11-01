import type { Store } from '@state/store';
import type { GameState, DealOutcome } from '@state/schema';
import type { Segment, DriverSegment } from '@/types/segment';
import { onAiTick, onPostTick, isLivePhase } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { say, sayChoice, withdrawChoice } from '@systems/say';
import { emit } from '@systems/events';
import { hollowReach, acceptDeal, biteIntervalSec } from '@systems/hollow';
import { getOpsBySeg } from '@systems/ops-core';
import { segmentStarts } from '@systems/memory-ops';
import { driversInMemory } from '@state/selectors';
import { podCode } from '@data/landing-text';
import { HOLLOW_DEAL } from '@data/hollow-text';
import {
  DEAL_FRONT_BLOCKS, DEAL_MIN_DRIVERS, DEAL_TIMEOUT_SEC, DEAL_PAUSE_SEC, DEAL_HASTE_SEC, DEAL_REFUSE_INTERVAL_FACTOR,
} from '@data/tuning';

// THE DEAL (§1, §5.3 moment 12, §6.6, §9 WP10 item 5): HOLLOW's most personal moment so far. On a ship whose HOLLOW
// deals (the HUNT stage, which the fixed five never reach; and folded into the final ship when the run had none, 04
// §3.9: on the fixed five that is LAST LIGHT, offered only before ORBIT LOCK), once, when one of its fronts stands within
// DEAL_FRONT_BLOCKS free blocks of a pod's driver and at least DEAL_MIN_DRIVERS drivers are still in memory, it offers,
// in the TERMINAL, with ACCEPT and REFUSE buttons and a DEAL_TIMEOUT_SEC timer on AI time (say.ts sayChoice; it starts
// once the line has typed):
//   `> give me pod08. then i leave the others alone. for a while.`
// • ACCEPT: the named driver is eaten at once (its pod can't launch: parked in orbit), every infection is cured, and
//   the spread stands still for DEAL_PAUSE_SEC (no bites, no seeds, no verbs: hollow-verbs.ts verbsHeld). CONTROL:
//   "Negotiating with unauthorized processes is not recommended. :)". The cost is the pod, named and counted. On a ship
//   with verbs the pause ends at ORBIT LOCK: the duel is never fought unopposed.
// • REFUSE, or the timer running out: `> ok.`, and the bites come DEAL_REFUSE_INTERVAL_FACTOR as often for
//   DEAL_HASTE_SEC, starting with the one already counting down (NEXT BITE drops: the refusal's cost is seen at once).
// • The offer is withdrawn if the named driver launches, moves (a MOVE starting on it, or it no longer standing where it
//   was) or is eaten before the answer: `> never mind.` (eaten: `> never mind. i took it.`). On a ship with verbs it is
//   also withdrawn, silently, at ORBIT LOCK (dealLive): the duel's lines and FinaleChoice never share the screen with it.
// • While the offer stands HOLLOW holds the named driver in its teeth: its drain stands still (hollow.ts dealHolds),
//   so the offer's 15 s are the one clock on it, and a kid who freezes gets the timeout's cost, not a driver eaten
//   mid-offer (WP10 review: with the drain running, C08 was eaten before the timer ran out on 6 of 8 seeds). Every
//   other bite and drain goes on: that, and the clock, are the pressure.
// It is never offered twice: not on this ship (deal.phase), nor in this run (run.stats.deal records how it ended, also
// an offer the ship's end cut short).
// It is offered the tick the front stands (on LAST LIGHT, HOLLOW's wake: it bites both drivers beside the root, then
// bargains): the TERMINAL types its lines in order, so the offer types right after the bite's echoes, and its timer
// starts once it has typed. (A wait for both screens to be quiet first let a kid who walls fast move the driver out of
// reach before the offer came, and the moment never happened.) It can come during a burn (a choice is critical), and its
// timer runs on AI time (pause freezes it, OVERCLOCK does not stretch it). Runs on the AI tick after HOLLOW's (its bite of
// this tick is in), DOM-free.

export const DEAL_ACCEPT = 'ACCEPT';
export const DEAL_REFUSE = 'REFUSE';

// The driver at HOLLOW's front (the one the deal names): a pod's driver not moving, within DEAL_FRONT_BLOCKS free blocks
// of a hollow block on either side; the nearest, then the lowest address. null: none. Pure.
export function dealFront(memory: readonly Segment[], aiNow: number): DriverSegment | null {
  const starts = segmentStarts(memory);
  let best: { driver: DriverSegment; gap: number; addr: number } | null = null;
  for (const reach of hollowReach(memory, aiNow)) {
    if (reach.gapBlocks > DEAL_FRONT_BLOCKS || reach.neighbourId === null) continue;
    const index = memory.findIndex((seg) => seg.id === reach.neighbourId);
    const seg = memory[index];
    if (!seg || seg.type !== 'driver' || seg.state === 'transferring') continue;
    const addr = starts[index]!;
    if (best === null || reach.gapBlocks < best.gap || (reach.gapBlocks === best.gap && addr < best.addr)) {
      best = { driver: seg, gap: reach.gapBlocks, addr };
    }
  }
  return best?.driver ?? null;
}

// Something is still to bargain over: a live ship whose landing has not ended. Once END LANDING (or the auto-end) has
// parked the pods still aboard, a pod given up would launch nothing anyway; their drivers stay in memory only until the
// report (01-landing §3.10), so the deal is not offered then, and an offer still standing is withdrawn.
// On a ship whose HOLLOW has verbs (THE DEAL folded into the final ship, 04 §3.9: "before ORBIT LOCK") the bargain lives
// only while the flight is on: at the lock the root opens for the duel, so an offer is never made after it, and one still
// standing is withdrawn there (the review's M2: its buttons stood beside FinaleChoice).
function dealLive(state: Readonly<GameState>): boolean {
  if (state.hollow.cfg.verbs !== null && state.run.phase !== 'flight') return false;
  return isLivePhase(state) && !(state.run.phase === 'landing' && state.landing.ended !== null);
}

// The deal may be offered now: a dealing HOLLOW awake on a live ship (dealLive), nothing offered yet on this ship or in
// this run, and enough drivers left to bargain over.
function dealOpen(state: Readonly<GameState>): boolean {
  const hollow = state.hollow;
  return hollow.cfg.deal && hollow.phase === 'awake' && hollow.deal.phase !== 'offered' && hollow.deal.phase !== 'done'
    && state.run.stats.deal === null && dealLive(state) && driversInMemory(state).length >= DEAL_MIN_DRIVERS;
}

// Why the named driver can no longer be bargained over (null: the offer still stands): HOLLOW ate it while the kid
// decided ('eaten'), or it launched, is being moved or
// no longer stands where it stood at the offer ('gone').
type DealVoid = 'eaten' | 'gone';

function dealVoid(state: Readonly<GameState>): DealVoid | null {
  const deal = state.hollow.deal;
  const index = state.memory.findIndex((seg) => seg.id === deal.segId);
  const seg = state.memory[index];
  if (!seg || seg.type !== 'driver') {
    return state.landing.pods.some((record) => record.pod === deal.pod && record.driverLost === 'eaten') ? 'eaten' : 'gone';
  }
  if (getOpsBySeg(seg.id).some((operation) => operation.kind === 'move')) return 'gone';
  return segmentStarts(state.memory)[index] !== deal.startAddr ? 'gone' : null;
}

// The answer the TERMINAL's buttons (or the timer) gave, acted on at the next tick (a click lands between ticks, and
// the effect is one batch of store updates and lines, never inside the choice's own update).
let answer: { picked: string | null } | null = null;

function resetDeal(): void {
  answer = null;
}

function record(store: Store<GameState>, outcome: DealOutcome, pod: number): void {
  store.update((draft) => {
    draft.hollow.deal.phase = 'done';
    draft.hollow.deal.entryId = null;
    draft.run.stats.deal = { outcome, pod, shipId: draft.level.shipId };
  });
  emit('deal', { outcome, pod });
}

function offer(store: Store<GameState>, driver: DriverSegment): void {
  const state = store.getState();
  const index = state.memory.indexOf(driver);
  if (index < 0) throw new Error(`hollow-deal: the offer names pod ${driver.pod}, whose driver is not in memory`);
  const addr = segmentStarts(state.memory)[index]!;
  const entryId = sayChoice('hollow', HOLLOW_DEAL.offer(podCode(driver.pod)), [DEAL_ACCEPT, DEAL_REFUSE], DEAL_TIMEOUT_SEC, (picked) => {
    answer = { picked };
  }, { keys: [HOLLOW_DEAL.acceptKey, HOLLOW_DEAL.refuseKey], tickerWords: HOLLOW_DEAL.tickerWords });
  store.update((draft) => {
    draft.hollow.deal = { ...draft.hollow.deal, phase: 'offered', pod: driver.pod, segId: driver.id, startAddr: addr, entryId };
    // THE DEAL folded into a final ship counts as HUNT played once it is offered (threat-plan.ts applyThreat).
    if (!draft.run.threat.stagesPlayed.includes('hunt')) draft.run.threat.stagesPlayed.push('hunt');
  });
  emit('deal-offered', { pod: driver.pod });
}

function settle(store: Store<GameState>, picked: string | null): void {
  const state = store.getState();
  const deal = state.hollow.deal;
  if (deal.pod === null) throw new Error('hollow-deal: an answer to a deal that names no pod');
  const pod = deal.pod;
  if (picked === DEAL_ACCEPT) {
    const driver = state.memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.id === deal.segId);
    if (!driver) throw new Error(`hollow-deal: ACCEPT, but pod ${pod}'s driver is gone (the offer should have been withdrawn)`);
    acceptDeal(store, driver);
    store.update((draft) => { draft.hollow.deal.pauseUntilAi = draft.clock.aiSec + DEAL_PAUSE_SEC; });
    say('control', HOLLOW_DEAL.control, { critical: true });
    record(store, 'accepted', pod);
    return;
  }
  if (picked !== null && picked !== DEAL_REFUSE) throw new Error(`hollow-deal: '${picked}' is not an answer to the deal`);
  // The bite already counting down comes sooner too, so the refusal's cost shows at once (NEXT BITE drops).
  store.update((draft) => {
    draft.hollow.deal.hasteUntilAi = draft.clock.aiSec + DEAL_HASTE_SEC;
    if (draft.hollow.biteInSec !== null) draft.hollow.biteInSec *= DEAL_REFUSE_INTERVAL_FACTOR;
  });
  say('hollow', HOLLOW_DEAL.ok, { critical: true });
  record(store, picked === null ? 'timeout' : 'refused', pod);
}

// The offer is taken back unanswered (its buttons go), with HOLLOW's line when it has one to say; the run keeps it
// 'invalidated'.
function withdraw(store: Store<GameState>, line: string | null): void {
  const deal = store.getState().hollow.deal;
  if (deal.entryId === null || deal.pod === null) throw new Error('hollow-deal: an offer with no TERMINAL line');
  answer = null;
  withdrawChoice(deal.entryId);
  if (line !== null) say('hollow', line, { critical: true });
  record(store, 'invalidated', deal.pod);
}

function tick(store: Store<GameState>): void {
  const state = store.getState();
  if (!state.hollow.cfg.deal) return;
  const deal = state.hollow.deal;
  // An ACCEPT's pause ends at ORBIT LOCK on a ship with verbs (the review's M2): "i leave the others alone" was a bargain
  // for the flight, and the duel is never fought unopposed (the verbs, the bites and the seeds all wait on the pause).
  if (state.hollow.cfg.verbs !== null && state.run.phase !== 'flight' && deal.pauseUntilAi !== null && deal.pauseUntilAi > state.clock.aiSec) {
    store.update((draft) => { draft.hollow.deal.pauseUntilAi = draft.clock.aiSec; });
  }
  if (deal.phase === 'offered') {
    // The landing ended under the offer (the ship's own end is the post-tick's): nothing left to bargain over, even if
    // an answer came in the same moment.
    if (!dealLive(state)) {
      withdraw(store, null);
      return;
    }
    // A driver that launched, moved or was eaten first voids the offer, even if an answer came in the same moment.
    const voided = dealVoid(state);
    if (voided !== null) {
      withdraw(store, voided === 'eaten' ? HOLLOW_DEAL.tookIt : HOLLOW_DEAL.neverMind);
      return;
    }
    if (answer !== null) {
      const { picked } = answer;
      answer = null;
      settle(store, picked);
    }
    return;
  }
  if (!dealOpen(state)) return;
  const front = dealFront(state.memory, state.clock.aiSec);
  if (front !== null) offer(store, front);
}

// What NEXT BITE will count from now on, and whether the spread stands still (the deal's effect, for readouts).
export function dealEffectNow(state: Readonly<GameState>): { pausedForSec: number; hastedForSec: number; intervalSec: number | null } {
  const { deal, cfg } = state.hollow;
  const now = state.clock.aiSec;
  return {
    pausedForSec: deal.pauseUntilAi === null ? 0 : Math.max(0, deal.pauseUntilAi - now),
    hastedForSec: deal.hasteUntilAi === null ? 0 : Math.max(0, deal.hasteUntilAi - now),
    intervalSec: cfg.spreadEverySec === null ? null : biteIntervalSec(cfg.spreadEverySec, state.hollow, now),
  };
}

// ?debug and tests: the deal offered now, naming this driver (or the one at the front), whatever the trigger says.
export function offerDealNow(store: Store<GameState>, driver?: DriverSegment): void {
  const state = store.getState();
  if (!state.hollow.cfg.deal) throw new Error(`offerDealNow: ${state.level.shipName}'s HOLLOW does not deal`);
  if (state.hollow.deal.phase === 'offered' || state.hollow.deal.phase === 'done') throw new Error('offerDealNow: the deal was already offered on this ship');
  const named = driver ?? dealFront(state.memory, state.clock.aiSec);
  if (!named) throw new Error('offerDealNow: no driver stands at HOLLOW\'s front');
  offer(store, named);
}

let mounted = false;

// Mount after HOLLOW (its AI tick runs first: this tick's bite is in before the deal looks at the front).
export function mountHollowDeal(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountHollowDeal: already mounted');
  mounted = true;
  const offTick = onAiTick(() => tick(store));
  // A ship that is over (crashed, landed, its Core eaten), or a landing that has ended (dealLive), takes an open offer
  // with it: nothing is left to bargain over. The run still keeps that HOLLOW offered (run.stats.deal, 'invalidated'):
  // WP10 review, it read as no deal at all.
  const offOver = onPostTick(() => {
    const state = store.getState();
    const deal = state.hollow.deal;
    if (deal.phase !== 'offered' || dealLive(state)) return;
    withdraw(store, null);
  });
  const offReset = onWorldReset('hollow-deal', resetDeal, () => ({ answer }));
  return () => {
    offTick();
    offOver();
    offReset();
    resetDeal();
    mounted = false;
  };
}
