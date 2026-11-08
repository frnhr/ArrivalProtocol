// Slice 7a: Track FINALE owns this file after the FOUNDATION (docs/phase3/impl/slice-7-plan.md §4.1, §5.1): the phases (R6),
// the prices (R8, R9, R11), the pick and the confirm (R7), the apply (PURGE, MERGE's interim R15, SPARE), UNRESOLVED (R10)
// and the verdict (R13). The FOUNDATION laid down the v7 machine with WP11's one step behind ENDINGS_BUILT.twoStep (data/
// endings.ts): with the gate down the card opens as the root falls, PURGE or MERGE, step 2 is REASSIGNMENT, applied at once.
import type { Store } from '@state/store';
import type { GameState, EndingLine, FinaleEnding } from '@state/schema';
import type { HollowChoice, YouChoice } from '@/types/ending';
import type { HollowSegment, Segment, DriverSegment } from '@/types/segment';
import type { PodRecord } from '@/types/landing';
import { onAiTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { emit, NO_PAYLOAD } from '@systems/events';
import { glitchBurst } from '@systems/glitch';
import { getOpsBySeg, abortOp } from '@systems/ops-core';
import { say, hollowLabel, unitName, assertLineFits, mindTypedByAi, typingSec, withdrawUntimedChoices } from '@systems/say';
import { theRoot, rootDeleteRunning, rootDeleteProgress, nameHollow } from '@systems/hollow';
import { clearAlert, VERB_ALERT_ID, SEED_ALERT_ID } from '@systems/alerts';
import { replaceRange, mergeAdjacentFree, requireAddr, freeSegment, assertMemoryInvariants } from '@systems/memory-ops';
import { spendCharge, cureInfection } from '@state/actions';
import { chargeLeft, infectedSegments, isHollow, integrityState, rootDeletable } from '@state/selectors';
import { driverName } from '@data/landing-text';
import { driverSegId } from '@data/pod-ids';
import { echoWord, TOOL_REFUSAL } from '@data/tool-text';
import { fleetOf } from '@systems/map-run';
import { fleetHome } from '@systems/run-score';
import { layoutOf } from '@data/memory';
import { HOLLOW_FINALE } from '@data/hollow-text';
import { IS_DEV } from '@/env';
import { formatCount } from '@data/format';
import { ENDINGS_BUILT } from '@data/endings';
import { optionState, stayCandidates, endingRecordAt } from '@systems/ending-rules';
import { FINALE_TEXT } from '@data/finale-text';
import { notBuilt } from '@systems/not-built';
import {
  MERGE_COST_CHARGE, MERGE_DRIVER_INTEGRITY, DRIVER_BLOCKS, GLITCH_BURST_LEVEL, GLITCH_BURST_MS,
  DUEL_SPIKE_EVERY_START_SEC, DUEL_SPIKE_EVERY_END_SEC, DUEL_SPIKE_LEVEL_START, DUEL_SPIKE_LEVEL_END, DUEL_SPIKE_MS,
  ROOT_GONE_GLITCH_LEVEL, ROOT_GONE_GLITCH_MS, MERGE_GLITCH_LEVEL, MERGE_GLITCH_MS, FINALE_ENDING_MAX_LINES,
  FINALE_ENDING_CPS, FINALE_ENDING_GAP_SEC, FINALE_ENDING_HOLD_SEC, CONTROL_CHIME_LEAD_SEC, FINALE_OPEN_DELAY_SEC,
} from '@data/tuning';

// LAST LIGHT's finale (§1, §4.3, §6.6, §9 WP11 items 4–5), DOM-free. The flagship's ship ends here, and so does the run.
// • THE DUEL. As the flagship's orbit is locked or accepted (the ship goes into 'landing'), its root opens: no longer
//   LOCKED, ARRIVAL CONTROL says "Please delete UNIT-046. :)", and the strip says DELETE THE ROOT. Its DELETE is one
//   ROOT_DELETE_SEC op (state/actions.ts), during which HOLLOW's verbs come every duelEverySec (systems/hollow-verbs.ts);
//   the running DELETE keeps its thread whatever the Core does (ops-core never takes a thread back). The landing goes on
//   meanwhile, and the LANDING REPORT waits for the finale (systems/landing.ts, finalePending): a ship whose pods are
//   all down before the root's end waits with `EVERY POD IS DOWN — now DELETE THE ROOT` (01-landing §3.11 L0).
// • THE LAST BLOCK. The DELETE leaves one block in the root's middle (data/memory.ts rootRemains). HOLLOW stops: no
//   more bites, seeds or verbs (it sleeps), and what it was eating it lets go, cured where it stands. (§6.6 says only
//   that spread and seeds stop; a dead root's teeth drained on while the kid read the choice, which is no choice at
//   all. WP11 deviation.) In its pink: `> 047. wait.` Then PURGE or MERGE.
// • PURGE: every block of HOLLOW leaves memory (the last block, its seeds, the blocks it ate: their pods stay parked),
//   clean and a little cold: `> rm unit_046 ... OK`, and CONTROL thanks Unit 47 and stands it by for reassignment.
// • MERGE: needs MERGE_COST_CHARGE REPAIR CHARGE (refused with `NEEDS 20 CHARGE (you have 14)` below it) and costs it.
//   1a (plan risk 9; 01-landing §3.17's last landing is slice 7): every driver HOLLOW ate on this ship whose block still
//   stands (moved by an MV or not) turns back into a driver in place at MERGE_DRIVER_INTEGRITY, its pod launches like any
//   other, and a landing that had ended resumes. A pod whose block is gone (the kid DELETEd it) stays parked, restorable,
//   for slice 7 (it scores 0 in 1a). Its other blocks go with it into you: `> merge unit_046 -> unit_047 ... OK`, and
//   CONTROL calls Unit 47 non-compliant. The next run carries the merge (systems/meta.ts: 'won-merge').
// • UNRESOLVED (§4.3): the landing is over, the root still stands, no DELETE of it is running, and nothing can delete it
//   (no working Rm, and none a REPAIR could bring back): the ship ends unresolved. `> you can't delete me now.`
// RUN END's cause after the flagship's LANDING REPORT is finaleRunCause.
// WP11 part 2 (the moment's look and sound live in the views; this keeps their timing on AI time, DOM-free):
// • THE SPIKES. The root opening tears the screen once (a verb's glitchBurst); while its DELETE runs HOLLOW thrashes:
//   a spike every DUEL_SPIKE_EVERY_START_SEC quickening to DUEL_SPIKE_EVERY_END_SEC, stronger the nearer the DELETE is
//   to done ('duel-spike' carries the progress for the sound); its end is the biggest tear of the game.
// • THE ENDING. PURGE and MERGE each write their typed ending (≤ FINALE_ENDING_MAX_LINES lines, from live numbers:
//   finaleEndingLines) into hollow.finale.ending, in the same store update as the choice's phase (WP11 review: written
//   one update later, the card saw a chosen finale with no ending, closed, and came back late or never), with the AI
//   seconds it starts and until which it holds the LANDING REPORT back (finaleEndingSec: the lines' typing at
//   FINALE_ENDING_CPS, the gaps, CONTROL's chime and a hold to read). The FinaleChoice card types it on that clock;
//   skipFinaleEnding (a click or a key) lets the report come at once.

// WP11's one-step pick (chooseFinale: the card before Track CARD's, ?debug's __ap.finale.choose).
export type FinaleChoice = 'purge' | 'merge';

// From the ship's landing slice (copied from ShipDef.final when the ship was built), never a ShipDef lookup: a
// generator-made final ship needs nothing new here.
function isFlagship(state: Readonly<GameState>): boolean {
  return state.landing.finalShip;
}

// How the run ends after the flagship's LANDING REPORT: systems/ending-rules.ts finaleRunCause (slice 7a, R17).

// The `MERGE 20` tick the charge readouts carry on the flagship (§7.1 `.mem-stats`, §9 WP11 item 1): MERGE's price, while
// the choice is still ahead (null on every other ship, and once the finale is decided). Part 2 draws it.
export function mergeTickCharge(state: Readonly<GameState>): number | null {
  if (!isFlagship(state)) return null;
  const phase = state.hollow.finale.phase;
  return phase === 'none' || phase === 'duel' || phase === 'asleep' || phase === 'step1' || phase === 'step2' ? MERGE_COST_CHARGE : null;
}

// Something can still delete the root: state/selectors rootDeletable (the landing's pure table reads it there too).
export { rootDeletable };

// Why WP11's one-step choice can't be made now (null: it can). MERGE needs its price (§9 WP11 item 5).
export function finaleChoiceRefusal(state: Readonly<GameState>, choice: FinaleChoice): string | null {
  if (state.hollow.finale.phase !== 'step1' || !state.hollow.finale.rootFell) return 'NOT NOW';
  if (state.clock.paused) return TOOL_REFUSAL.paused;
  if (choice === 'merge' && chargeLeft(state) < MERGE_COST_CHARGE) return HOLLOW_FINALE.mergeNeeds(chargeLeft(state));
  return null;
}

// --- The typed endings (§9 WP11 item 5) ------------------------------------------------------------------------------

// The people on this ship whose pods still have their drivers, everyone HOLLOW or the belt did not take: down already,
// falling, or aboard (the landing only moves them from one to the other, so the number holds while the ending types).
function colonistsInOrbit(state: Readonly<GameState>): number {
  return state.landing.pods.filter((record) => record.driverLost === null && record.fate.kind !== 'not-launched')
    .reduce((sum, record) => sum + record.colonists, 0);
}

// The pods whose drivers HOLLOW ate on this ship and which are not back yet: what MERGE would bring back, and what PURGE
// leaves parked (FinaleChoice names them on its buttons).
export function podsEatenHere(state: Readonly<GameState>): PodRecord[] {
  return state.landing.pods.filter((record) => record.driverLost === 'eaten');
}

function colonistsEatenHere(state: Readonly<GameState>): number {
  return podsEatenHere(state).reduce((sum, record) => sum + record.colonists, 0);
}

// The typed ending a choice just made writes, from the world as it is right after it.
export function finaleEndingLines(state: Readonly<GameState>, choice: FinaleChoice): EndingLine[] {
  const hollowWord = echoWord(hollowLabel(state.run));
  const inOrbit = colonistsInOrbit(state);
  const shipName = state.level.shipName;
  const unit = state.mission.transmissionNum;
  let lines: EndingLine[];
  if (choice === 'purge') {
    const eaten = colonistsEatenHere(state);
    // The flagship is in orbit (its finale opens only at a lock or an accept) but not recorded until its LANDING REPORT.
    const fleet = fleetHome(state.run.ships, fleetOf(state.run.map).length, state.level.shipId);
    lines = HOLLOW_FINALE.purgeEnding({
      shipName, inOrbit: formatCount(inOrbit), anyoneHome: inOrbit > 0, eaten: eaten > 0 ? formatCount(eaten) : null, hollowWord, unit,
      shipsHome: fleet.home, fleetSize: fleet.total,
    });
  } else {
    // Back in memory in place: every one of them is counted in inOrbit now.
    const restored = state.landing.pods.filter((record) => state.hollow.finale.restored.includes(record.pod))
      .reduce((sum, record) => sum + record.colonists, 0);
    lines = HOLLOW_FINALE.mergeEnding({
      shipName, inOrbit: formatCount(inOrbit), restored: restored > 0 ? formatCount(restored) : null, hollowWord,
      ours: echoWord(unitName(state.run.unitNumber)), unit,
    });
  }
  if (lines.length > FINALE_ENDING_MAX_LINES) throw new Error(`finale: the ${choice} ending has ${lines.length} lines (max ${FINALE_ENDING_MAX_LINES})`);
  for (const line of lines) assertLineFits(line.text);
  return lines;
}

// How long an ending is on screen: each line typed at FINALE_ENDING_CPS after the one before it and a gap (CONTROL's
// after its chime), then a hold to read the last one. FinaleChoice types to these starts, from the ending's startAi.
export function finaleEndingLineStartsSec(lines: readonly EndingLine[]): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const line of lines) {
    starts.push(at + (line.voice === 'control' ? CONTROL_CHIME_LEAD_SEC : 0));
    at = starts[starts.length - 1]! + line.text.length / FINALE_ENDING_CPS + FINALE_ENDING_GAP_SEC;
  }
  return starts;
}

export function finaleEndingSec(lines: readonly EndingLine[]): number {
  if (lines.length === 0) throw new Error('finaleEndingSec: an ending without lines');
  const starts = finaleEndingLineStartsSec(lines);
  const last = lines[lines.length - 1]!;
  return starts[starts.length - 1]! + last.text.length / FINALE_ENDING_CPS + FINALE_ENDING_HOLD_SEC;
}

// The ending a choice writes, from the world as the choice left it (called inside the choice's own update).
function endingFor(state: Readonly<GameState>, choice: FinaleChoice, you: YouChoice): FinaleEnding {
  const lines = finaleEndingLines(state, choice);
  const startAi = state.clock.aiSec;
  return { choice: { hollow: choice, you }, lines, startAi, untilAi: startAi + finaleEndingSec(lines) };
}

// The kid ended the typed ending early (FinaleChoice: a click, SPACE or ENTER once it has typed): the LANDING REPORT may
// come now. false when no ending is on.
export function skipFinaleEnding(store: Store<GameState>): boolean {
  const state = store.getState();
  const ending = state.hollow.finale.ending;
  if (ending === null || state.clock.aiSec >= ending.untilAi) return false;
  store.update((draft) => {
    if (draft.hollow.finale.ending) draft.hollow.finale.ending.untilAi = draft.clock.aiSec;
  });
  return true;
}

// The typed ending is on screen now (FinaleChoice shows it; the LANDING REPORT waits for it).
export function finaleEndingShowing(state: Readonly<GameState>): boolean {
  const ending = state.hollow.finale.ending;
  return ending !== null && state.clock.aiSec < ending.untilAi;
}

// --- The duel's spikes ------------------------------------------------------------------------------------------------

// AI seconds to the next spike while the root's DELETE runs (null: the DELETE is not running; the first comes at once).
let spikeInSec: number | null = null;
// CONTROL's verdict on the choice (`Thank you, Unit 47. …` / `Unit 47 is non-compliant. :)`), owed to the radio until
// the typed ending is over (WP12 p3, the lead's note of 22:40): the card types that line as its last beat, and said at
// the choice it ran on the header's ticker before the card got there, spoiling the ending.
let verdictOwed: string | null = null;

function stepSpikes(state: Readonly<GameState>, dtAi: number): void {
  const progress = rootDeleteProgress(state);
  if (progress === null) {
    spikeInSec = null;
    return;
  }
  spikeInSec = (spikeInSec ?? 0) - dtAi;
  if (spikeInSec > 0) return;
  const level = DUEL_SPIKE_LEVEL_START + (DUEL_SPIKE_LEVEL_END - DUEL_SPIKE_LEVEL_START) * progress;
  glitchBurst(level, DUEL_SPIKE_MS);
  emit('duel-spike', { progress });
  spikeInSec = DUEL_SPIKE_EVERY_START_SEC + (DUEL_SPIKE_EVERY_END_SEC - DUEL_SPIKE_EVERY_START_SEC) * progress;
}

// --- The moments ---------------------------------------------------------------------------------------------------

// ORBIT LOCK (or ACCEPT) on the flagship: the root opens for the duel. ARRIVAL CONTROL names it in its order, so a HOLLOW
// that never said who it is (a run that lost VESPER before its naming and whose final-ship wake story was cut short, or
// ?debug and a suite that start at LAST LIGHT) is named here first: the last fallback (slice 2, THREAT deviation 11).
function openRoot(store: Store<GameState>): void {
  const root = theRoot(store.getState().memory);
  if (root === null) throw new Error('finale: the flagship has no root to open');
  nameHollow(store);
  store.update((draft) => {
    const seg = draft.memory.find((candidate) => candidate.id === root.id);
    if (!seg || !isHollow(seg)) throw new Error('finale: the root left memory mid-update');
    seg.locked = false;
    draft.hollow.finale.phase = 'duel';
    draft.ui.memoryRev++;
  });
  say('control', HOLLOW_FINALE.deleteIt(hollowLabel(store.getState().run)), { critical: true });
  glitchBurst(GLITCH_BURST_LEVEL, GLITCH_BURST_MS);
  emit('root-unlocked', NO_PAYLOAD);
}

// The root's DELETE completed (one last block stands where it was): HOLLOW stops, and lets go of what it was eating
// ('asleep', R6). With the two steps not built the card opens at once (WP11: the choice came with the root's end).
function rootGone(store: Store<GameState>): void {
  const cured = infectedSegments(store.getState());
  store.update((draft) => {
    draft.hollow.finale.phase = 'asleep';
    draft.hollow.finale.rootFell = true;
    draft.hollow.phase = 'dormant';
    draft.hollow.biteInSec = null;
    draft.hollow.seedInSec = null;
    draft.hollow.seedTelegraph = null;
    // A verb still counting down dies with the root (its line ends with HOLLOW's last words below).
    draft.hollow.verbInSec = null;
    draft.hollow.verb = null;
    for (const seg of cured) cureInfection(seg, draft.clock.aiSec);
    draft.ui.memoryRev++;
  });
  clearAlert(store, VERB_ALERT_ID);
  clearAlert(store, SEED_ALERT_ID);
  for (const seg of cured) emit('hollow-cure', { segId: seg.id });
  glitchBurst(ROOT_GONE_GLITCH_LEVEL, ROOT_GONE_GLITCH_MS);
  say('hollow', HOLLOW_FINALE.lastWords(store.getState().run.unitNumber), { critical: true });
  emit('finale-asleep', NO_PAYLOAD);
  if (!ENDINGS_BUILT.twoStep) openStep1(store);
}

// The landing is settled (R6): it has ended, no pod is falling, and HOLLOW's line has typed in the TERMINAL. The card may
// come up then (a touchdown bell under a card that asks a question reads like an answer).
function landingSettled(state: Readonly<GameState>): boolean {
  return state.landing.ended !== null && !state.landing.pods.some((record) => record.fate.kind === 'falling')
    && mindTypedByAi(state) <= state.clock.aiSec;
}

// The FINALE's card opens on step 1 (R6, R18): FINALE_OPEN_DELAY_SEC from now, and any untimed choice standing in the
// TERMINAL is withdrawn (say.ts's arbiter keeps every other choice shut while the card is up).
function openStep1(store: Store<GameState>): void {
  withdrawUntimedChoices();
  store.update((draft) => {
    draft.hollow.finale.phase = 'step1';
    draft.hollow.finale.cardAtAi = draft.clock.aiSec + FINALE_OPEN_DELAY_SEC;
  });
  if (ENDINGS_BUILT.twoStep) emit('finale-open', { step: 1 });
}

// HOLLOW's last line holds the LANDING REPORT until it has typed in the TERMINAL (after whatever the TERMINAL is still
// typing: the same sum say.ts keeps) and been read, like the typed endings (WP11 review: the report came 1.5 s after the
// last touchdown and cut it off at `> you can't delete`).
// Slice 7a (R10): with the two steps built, UNRESOLVED is step 1's IT FOLLOWED YOU card (rootFell false), and
// continueFollowed goes on to step 2; before that it is decided at once, 'followed' and REASSIGNMENT (R16's reading).
function unresolve(store: Store<GameState>): void {
  const state = store.getState();
  const line = HOLLOW_FINALE.unresolvedLine;
  const typedBy = Math.max(mindTypedByAi(state), state.clock.aiSec) + typingSec('hollow', line);
  store.update((draft) => {
    const finale = draft.hollow.finale;
    finale.unresolvedUntilAi = typedBy + FINALE_ENDING_HOLD_SEC;
    if (ENDINGS_BUILT.twoStep) {
      finale.phase = 'step1';
      finale.cardAtAi = typedBy + FINALE_OPEN_DELAY_SEC;
    } else {
      finale.phase = 'done';
      finale.hollow = 'followed';
      finale.you = 'reassignment';
      finale.record = endingRecordAt(draft, 'followed', 'reassignment', null);
    }
  });
  say('hollow', line, { critical: true });
  if (ENDINGS_BUILT.twoStep) {
    withdrawUntimedChoices();
    emit('finale-open', { step: 1 });
  }
}

// HOLLOW's blocks leave memory, every op on them first (a DELETE the kid had running on a seed ends with it).
function removeBlocks(memory: Segment[], blocks: readonly HollowSegment[]): void {
  for (const block of blocks) for (const operation of getOpsBySeg(block.id)) abortOp(operation.id);
  for (const block of blocks) {
    if (!memory.includes(block)) continue;
    const start = requireAddr(memory, block);
    replaceRange(memory, start, start + block.size, [freeSegment(block.size)], { opId: null, own: [block] });
  }
  mergeAdjacentFree(memory);
}

// A driver HOLLOW ate, back from its pod's record (the pod outlived it), at MERGE_DRIVER_INTEGRITY.
function driverFromRecord(record: Readonly<PodRecord>): DriverSegment {
  return {
    id: driverSegId(record.pod),
    name: driverName(record.pod, record.family),
    type: 'driver',
    size: DRIVER_BLOCKS,
    integrity: MERGE_DRIVER_INTEGRITY,
    state: integrityState(MERGE_DRIVER_INTEGRITY),
    pod: record.pod,
    family: record.family,
    colonists: record.colonists,
    featured: structuredClone(record.featured),
  };
}

function purge(store: Store<GameState>, you: YouChoice, stay: number | null): void {
  const memory = store.getState().memory;
  const blocks = memory.filter(isHollow);
  removeBlocks(memory, blocks);
  if (IS_DEV) assertMemoryInvariants(memory, layoutOf(store.getState()).totalBlocks);
  const gone = new Set(blocks.map((block) => block.id));
  store.update((draft) => {
    draft.hollow.finale.phase = 'done';
    draft.hollow.finale.hollow = 'purge';
    draft.hollow.finale.you = you;
    draft.hollow.finale.stay = stay;
    draft.hollow.finale.ending = endingFor(draft, 'purge', you);
    // Review M4: the record as the card saw it, after the apply (the blocks gone).
    draft.hollow.finale.record = endingRecordAt(draft, 'purge', you, stay);
    if (draft.ui.selectedId !== null && gone.has(draft.ui.selectedId)) draft.ui.selectedId = null;
    draft.ui.memoryRev++;
  });
  const state = store.getState();
  say('cmd', HOLLOW_FINALE.purgeEcho(echoWord(hollowLabel(state.run))), { critical: true });
  verdictOwed = HOLLOW_FINALE.purgeControl(state.mission.transmissionNum);
  emit('finale-chosen', { hollow: 'purge', you, restored: 0 });
}

function merge(store: Store<GameState>, you: YouChoice, stay: number | null): void {
  spendCharge(store, MERGE_COST_CHARGE);
  const state = store.getState();
  const memory = state.memory;
  const eaten = podsEatenHere(state);
  const blocks = memory.filter(isHollow);
  for (const block of blocks) for (const operation of getOpsBySeg(block.id)) abortOp(operation.id);
  const inPlace: number[] = [];
  for (const record of eaten) {
    const block = memory.find((seg): seg is HollowSegment => isHollow(seg) && seg.atePod === record.pod);
    if (block === undefined) continue;
    if (block.size !== DRIVER_BLOCKS) throw new Error(`finale: pod ${record.pod}'s block is ${block.size} blocks, not a driver's`);
    const start = requireAddr(memory, block);
    replaceRange(memory, start, start + block.size, [driverFromRecord(record)], { opId: null, own: [block] });
    inPlace.push(record.pod);
  }
  removeBlocks(memory, memory.filter(isHollow));
  if (IS_DEV) assertMemoryInvariants(memory, layoutOf(store.getState()).totalBlocks);
  const gone = new Set(blocks.map((block) => block.id));
  store.update((draft) => {
    // Back in memory: their pods have drivers again and launch like any other (a pod already parked comes back aboard).
    // The ones whose blocks are gone stay eaten: parked, restorable, for slice 7's last landing.
    for (const record of draft.landing.pods) {
      if (!inPlace.includes(record.pod)) continue;
      record.driverLost = null;
      record.restored = true;
      if (record.fate.kind === 'parked') record.fate = { kind: 'aboard' };
    }
    const finale = draft.hollow.finale;
    finale.phase = 'done';
    finale.hollow = 'merge';
    finale.you = you;
    finale.stay = stay;
    finale.restored = inPlace;
    // Its numbers count the drivers just given back.
    finale.ending = endingFor(draft, 'merge', you);
    // Review M4: the record as the card saw it, after the apply (MERGE's charge spent), before the landing reopens.
    finale.record = endingRecordAt(draft, 'merge', you, stay);
    // Drivers back in memory: the landing goes on with them (it may have ended, or been lingering toward the report).
    // The pods parked when it ended reopen too if their driver never left memory (parked 'no-time'): the landing parks
    // at the moment it ends (landing.ts endNow), so reopening it must unpark them; FUEL is noted again when it ends again.
    if (inPlace.length > 0) {
      draft.landing.ended = null;
      draft.landing.lingerAiSec = null;
      draft.landing.fuelAtEndPct = null;
      // Slice 1b: the reopened landing starts its burn offers afresh (no GO LOWER aim, no burn declined before the end).
      draft.landing.goLow = null;
      draft.landing.declined = null;
      for (const record of draft.landing.pods) {
        if (record.fate.kind === 'parked' && record.fate.why === 'no-time') record.fate = { kind: 'aboard' };
      }
    }
    if (draft.ui.selectedId !== null && gone.has(draft.ui.selectedId)) draft.ui.selectedId = null;
    draft.ui.memoryRev++;
  });
  const after = store.getState();
  say('cmd', HOLLOW_FINALE.mergeEcho(echoWord(hollowLabel(after.run)), echoWord(unitName(after.run.unitNumber))), { critical: true });
  verdictOwed = HOLLOW_FINALE.mergeControl(after.mission.transmissionNum);
  // It comes into you: a long rolling tear that settles into the faint shimmer the next run keeps.
  glitchBurst(MERGE_GLITCH_LEVEL, MERGE_GLITCH_MS);
  emit('finale-chosen', { hollow: 'merge', you, restored: inPlace.length });
}

// ENDING CHOSEN's save (slice 3c, systems/save-write.ts writeEndingChosen): CONTROL's verdict, if still owed, is said now,
// so the save's log has it (a resumed LANDING REPORT has no module state to say it from). The report has opened, so the
// typed ending it waited for is over.
export function sayOwedVerdict(): void {
  if (verdictOwed === null) return;
  say('control', verdictOwed, { critical: true });
  verdictOwed = null;
}

// Step 2's confirm applies both picks (R7): the blocks leave, MERGE's charge is spent, the verdict types. The FOUNDATION's
// apply is WP11's PURGE and MERGE with their typed endings, then 'done'; SPARE, the verdict (R13) and MERGE's reopened
// landing as 'last-landing' (R15) are Track FINALE's.
// `stay`: STAY's ship (null for every other step 2). The ending record is frozen in the apply's update (review M4).
function confirm(store: Store<GameState>, hollow: HollowChoice, you: YouChoice, stay: number | null): void {
  if (hollow === 'spare') notBuilt('finale SPARE\'s apply', 'FINALE', store, hollow, you);
  if (hollow === 'purge') purge(store, you, stay);
  else merge(store, you, stay);
  if (ENDINGS_BUILT.twoStep) emit('finale-step2', { you });
}

// WP11's one step: PURGE or MERGE, and REASSIGNMENT (the card before Track CARD's, ?debug's __ap.finale.choose). Returns
// the refusal when it can't be made (nothing changes then).
export function chooseFinale(store: Store<GameState>, choice: FinaleChoice): string | null {
  const refusal = finaleChoiceRefusal(store.getState(), choice);
  if (refusal !== null) {
    emit('refused', { reason: refusal });
    return refusal;
  }
  confirm(store, choice, 'reassignment', null);
  return null;
}

// --- The card's actions (slice 7a: components/run/FinaleChoice.ts, Track CARD, calls them) ------------------------------
// Each returns the refusal when it can't be done (said with the buzz; nothing changes), else null.

function refused(reason: string): string {
  emit('refused', { reason });
  return reason;
}

// Why a step's option can't be picked now (null: it can): the step's phase, the pause (look-only), its price
// (systems/ending-rules.ts optionState: an open option, or its need line).
function pickRefusal(state: Readonly<GameState>, phase: 'step1' | 'step2', piece: HollowChoice | YouChoice): string | null {
  if (state.hollow.finale.phase !== phase) return 'NOT NOW';
  if (state.clock.paused) return TOOL_REFUSAL.paused;
  const option = optionState(state, piece, []);
  if (option.kind === 'open') return null;
  return option.kind === 'needs' ? option.need : 'NOT NOW';
}

// Step 1's pick (R7): a pick, not a deed; step 2 comes up. Refused on UNRESOLVED's card (continueFollowed is its way on).
export function pickStep1(store: Store<GameState>, hollow: HollowChoice): string | null {
  const state = store.getState();
  const refusal = state.hollow.finale.rootFell ? pickRefusal(state, 'step1', hollow) : 'NOT NOW';
  if (refusal !== null) return refused(refusal);
  store.update((draft) => {
    draft.hollow.finale.hollow = hollow;
    draft.hollow.finale.phase = 'step2';
  });
  // Review m9: the card's events are the two-step path's (WP11's card plays its own hold).
  if (ENDINGS_BUILT.twoStep) emit('finale-open', { step: 2 });
  return null;
}

// [ESC] BACK on step 2 (R7): step 1 again, its pick kept as a pick.
export function backToStep1(store: Store<GameState>): string | null {
  if (store.getState().hollow.finale.phase !== 'step2') return refused('NOT NOW');
  store.update((draft) => { draft.hollow.finale.phase = 'step1'; });
  if (ENDINGS_BUILT.twoStep) emit('finale-open', { step: 1 });
  return null;
}

// Step 2's pick, the confirm (R7): both picks are applied.
// • Step 1's price is judged again here (review M6: the AI clock runs under the card, so a REPAIR can drain MERGE's charge
//   while step 2 is up): one that can no longer be paid sends the card back to step 1 with its reason, the pick kept; never
//   a throw mid-apply.
// • STAY (review M3): with one ★ ON TARGET ship it is that one, and this confirms; with more, it refuses with
//   FINALE_TEXT.stayPick and the card opens its sub-row (CARD's own, unsaved), whose pick is pickStay.
// The FOUNDATION applies REASSIGNMENT after PURGE or MERGE; the rest is FINALE's.
export function pickStep2(store: Store<GameState>, you: YouChoice): string | null {
  const state = store.getState();
  const hollow = state.hollow.finale.hollow;
  const refusal = pickRefusal(state, 'step2', you);
  if (refusal !== null) return refused(refusal);
  if (hollow === null) throw new Error('pickStep2: step 2 with no step-1 pick');
  if (hollow === 'followed') notBuilt('finale UNRESOLVED\'s step 2', 'FINALE', store, you);
  const first = optionState(state, hollow, []);
  if (first.kind !== 'open') {
    store.update((draft) => { draft.hollow.finale.phase = 'step1'; });
    if (ENDINGS_BUILT.twoStep) emit('finale-open', { step: 1 });
    return refused(first.kind === 'needs' ? first.need : 'NOT NOW');
  }
  let stay: number | null = null;
  if (you === 'stay') {
    const ships = stayCandidates(state);
    if (ships.length !== 1) return refused(FINALE_TEXT.stayPick);
    stay = ships[0]!.slot;
  }
  confirm(store, hollow, you, stay);
  return null;
}

// STAY's sub-row (R9; review M3): valid at 'step2' with STAY's several ships; refuses a slot that is not one of
// stayCandidates (the arm slot, the route index on the classic world), else confirms STAY with it. ESC in the sub-row only
// closes it (CARD's); ESC on step 2 is backToStep1.
export function pickStay(store: Store<GameState>, stay: number): string | null {
  return notBuilt('pickStay', 'FINALE', store, stay);
}

// UNRESOLVED's step 1 (R10): `IT FOLLOWED YOU`, CONTINUE [ENTER]: step 2 with step 1 'followed'.
export function continueFollowed(store: Store<GameState>): string | null {
  return notBuilt('continueFollowed', 'FINALE', store);
}

function tick(store: Store<GameState>, dtAi: number): void {
  const state = store.getState();
  // Before the phase test: the ending's last tick can be the one the landing moves to the LANDING REPORT in.
  if (verdictOwed !== null && !finaleEndingShowing(state)) {
    say('control', verdictOwed, { critical: true });
    verdictOwed = null;
  }
  if (!isFlagship(state) || state.run.coreLost || state.run.phase !== 'landing') return;
  const phase = state.hollow.finale.phase;
  if (phase === 'none') {
    openRoot(store);
    return;
  }
  if (phase === 'asleep') {
    if (landingSettled(state)) openStep1(store);
    return;
  }
  if (phase !== 'duel') return;
  if (theRoot(state.memory) === null) {
    spikeInSec = null;
    rootGone(store);
    return;
  }
  stepSpikes(state, dtAi);
  if (landingOver(state) && !rootDeleteRunning(state) && !rootDeletable(state)) unresolve(store);
}

// The landing will launch nothing more (UNRESOLVED's "the landing is over"): it was ended, or no pod is aboard or falling.
function landingOver(state: Readonly<GameState>): boolean {
  return state.landing.ended !== null || !state.landing.pods.some((record) => record.fate.kind === 'aboard' || record.fate.kind === 'falling');
}

let mounted = false;

// Mount after HOLLOW and its verbs (their AI tick runs first: the root's DELETE completes in the ops core's tick, and
// this tick sees the last block standing).
export function mountFinale(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountFinale: already mounted');
  mounted = true;
  // The finale itself lives in the store (hollow.finale); only the spikes' clock is module state.
  const offTick = onAiTick((dtAi) => tick(store, dtAi));
  const offReset = onWorldReset('finale', () => { spikeInSec = null; verdictOwed = null; }, () => ({ spikeInSec, verdictOwed }));
  return () => {
    offTick();
    offReset();
    spikeInSec = null;
    verdictOwed = null;
    mounted = false;
  };
}
