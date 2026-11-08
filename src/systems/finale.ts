// Slice 7a: Track FINALE owns this file after the FOUNDATION (docs/phase3/impl/slice-7-plan.md §4.1, §5.1): the phases (R6),
// the pick and the confirm (R7) with their prices (systems/ending-rules.ts, R8, R9, R11), the apply (PURGE, MERGE's interim
// R15, SPARE), UNRESOLVED (R10) and the verdict (R13). The 7a fix pass dropped the twoStep gate and WP11's one-step paths
// (review (e)): the two steps are the only FINALE.
import type { Store } from '@state/store';
import type { GameState, EndingLine } from '@state/schema';
import type { HollowChoice, HollowFate, YouChoice } from '@/types/ending';
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
import { infectedSegments, isHollow, integrityState, rootDeletable } from '@state/selectors';
import { driverName } from '@data/landing-text';
import { driverSegId } from '@data/pod-ids';
import { echoWord, TOOL_REFUSAL } from '@data/tool-text';
import { layoutOf } from '@data/memory';
import { HOLLOW_FINALE, unitDigits } from '@data/hollow-text';
import { IS_DEV } from '@/env';
import { optionState, stayCandidates, endingRecordAt, controlCompliant } from '@systems/ending-rules';
import { FINALE_TEXT } from '@data/finale-text';
import {
  MERGE_COST_CHARGE, MERGE_DRIVER_INTEGRITY, DRIVER_BLOCKS, GLITCH_BURST_LEVEL, GLITCH_BURST_MS,
  DUEL_SPIKE_EVERY_START_SEC, DUEL_SPIKE_EVERY_END_SEC, DUEL_SPIKE_LEVEL_START, DUEL_SPIKE_LEVEL_END, DUEL_SPIKE_MS,
  ROOT_GONE_GLITCH_LEVEL, ROOT_GONE_GLITCH_MS, MERGE_GLITCH_LEVEL, MERGE_GLITCH_MS,
  FINALE_ENDING_CPS, FINALE_ENDING_GAP_SEC, FINALE_ENDING_HOLD_SEC, CONTROL_CHIME_LEAD_SEC, FINALE_OPEN_DELAY_SEC,
  FINALE_VERDICT_MAX_LINES,
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
//   all. WP11 deviation.) Then the two steps (below).
// • UNRESOLVED (§4.3): the landing is over, the root still stands, no DELETE of it is running, and nothing can delete it
//   (no working Rm, and none a REPAIR could bring back): the ship ends unresolved. `> you can't delete me now.`
// RUN END's cause after the flagship's LANDING REPORT is finaleRunCause.
// WP11 part 2 (the moment's look and sound live in the views; this keeps their timing on AI time, DOM-free):
// • THE SPIKES. The root opening tears the screen once (a verb's glitchBurst); while its DELETE runs HOLLOW thrashes:
//   a spike every DUEL_SPIKE_EVERY_START_SEC quickening to DUEL_SPIKE_EVERY_END_SEC, stronger the nearer the DELETE is
//   to done ('duel-spike' carries the progress for the sound); its end is the biggest tear of the game.
// • THE VERDICT's clock. The confirm writes the verdict into hollow.finale.ending in the same store update as its phase
//   (WP11 review: written one update later, the card saw a chosen finale with no ending, closed, and came back late or
//   never), with the AI seconds it starts and until which it holds the LANDING REPORT back (finaleEndingSec: the lines'
//   typing at FINALE_ENDING_CPS, the gaps, CONTROL's chime and a hold to read). The FinaleChoice card types it on that
//   clock; skipFinaleEnding (a click or a key) lets the report come at once.
// Slice 7a, the two steps (05 §3.7; plan §2.7):
// • ASLEEP (R6). The root's last block sleeps: `> 047. wait. finish your landing. i'll be here.`, and the landing goes on.
//   Once it has ended, nothing is falling and the line has typed, step 1 is up from FINALE_OPEN_DELAY_SEC on (cardAtAi;
//   no pick before it). Any untimed TERMINAL choice is withdrawn as it opens (R18).
// • THE CARD (R7). Step 1's pick moves to step 2, [ESC] goes back with the pick kept, and nothing is applied until step 2's
//   confirm, which judges step 1's price again (review M6) and STAY's ship (M3: pickStay with several). UNRESOLVED's step 1
//   is the IT FOLLOWED YOU card (continueFollowed; no entry 12), HOLLOW quiet under it.
// • THE CONFIRM. PURGE deletes every block of HOLLOW, SPARE moves them to the empty ship, MERGE spends its charge and gives
//   its drivers back in place (R15), UNRESOLVED keeps the root (it comes with you). The record is frozen (review M4) and the
//   verdict types ('verdict': ≤ FINALE_VERDICT_MAX_LINES lines, the two commands echoed and CONTROL's line, said on the
//   radio once typed). Then MERGE with drivers given back reopens the landing ('last-landing', the kid's hands until 7b),
//   and every ending is 'done' when it has settled: the LANDING REPORT and ENDING CHOSEN (R14).

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

// The pods whose drivers HOLLOW ate on this ship and which are not back yet: what MERGE gives back (mergeIn).
function podsEatenHere(state: Readonly<GameState>): PodRecord[] {
  return state.landing.pods.filter((record) => record.driverLost === 'eaten');
}

// --- The verdict's clock (R13) ------------------------------------------------------------------------------------------

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

// The kid ended the typed ending early (FinaleChoice: a click, SPACE or ENTER once it has typed): the LANDING REPORT may
// come now. false when no ending is on. A skipped verdict (R13) goes on at once ('last-landing' or 'done'), so the card's
// skip and the phase never disagree for a tick.
export function skipFinaleEnding(store: Store<GameState>): boolean {
  const state = store.getState();
  const ending = state.hollow.finale.ending;
  const showing = ending !== null && state.clock.aiSec < ending.untilAi;
  if (showing) {
    store.update((draft) => {
      if (draft.hollow.finale.ending) draft.hollow.finale.ending.untilAi = draft.clock.aiSec;
    });
  }
  if (store.getState().hollow.finale.phase === 'verdict') verdictDone(store);
  return showing;
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

// HOLLOW goes quiet: no bites, seeds or verbs (a verb still counting down dies with it), and what it was eating it lets go,
// cured where it stands. `extra` runs in the same update.
function quietHollow(store: Store<GameState>, extra: (draft: GameState) => void): void {
  const cured = infectedSegments(store.getState());
  store.update((draft) => {
    extra(draft);
    draft.hollow.phase = 'dormant';
    draft.hollow.biteInSec = null;
    draft.hollow.seedInSec = null;
    draft.hollow.seedTelegraph = null;
    draft.hollow.verbInSec = null;
    draft.hollow.verb = null;
    for (const seg of cured) cureInfection(seg, draft.clock.aiSec);
    draft.ui.memoryRev++;
  });
  clearAlert(store, VERB_ALERT_ID);
  clearAlert(store, SEED_ALERT_ID);
  for (const seg of cured) emit('hollow-cure', { segId: seg.id });
}

// The root's DELETE completed (one last block stands where it was): HOLLOW sleeps there ('asleep', R6) and asks the kid to
// finish the landing (`> 047. wait. finish your landing. i'll be here.`); the card opens when the landing has settled.
function rootGone(store: Store<GameState>): void {
  quietHollow(store, (draft) => {
    draft.hollow.finale.phase = 'asleep';
    draft.hollow.finale.rootFell = true;
  });
  glitchBurst(ROOT_GONE_GLITCH_LEVEL, ROOT_GONE_GLITCH_MS);
  const unit = store.getState().run.unitNumber;
  say('hollow', FINALE_TEXT.asleep(unitDigits(unit)), { critical: true });
  emit('finale-asleep', NO_PAYLOAD);
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
  emit('finale-open', { step: 1 });
}

// HOLLOW's last line holds the LANDING REPORT until it has typed in the TERMINAL (after whatever the TERMINAL is still
// typing: the same sum say.ts keeps) and been read, like the typed endings (WP11 review: the report came 1.5 s after the
// last touchdown and cut it off at `> you can't delete`).
// Slice 7a (R10): UNRESOLVED is step 1's IT FOLLOWED YOU card (rootFell false) once the line has typed, and
// continueFollowed goes on to step 2; HOLLOW goes quiet under the card (it comes with you: a root biting under a modal
// would be a fight nobody can fight).
function unresolve(store: Store<GameState>): void {
  const state = store.getState();
  const line = HOLLOW_FINALE.unresolvedLine;
  const typedBy = Math.max(mindTypedByAi(state), state.clock.aiSec) + typingSec('hollow', line);
  quietHollow(store, () => undefined);
  store.update((draft) => {
    const finale = draft.hollow.finale;
    finale.unresolvedUntilAi = typedBy + FINALE_ENDING_HOLD_SEC;
    finale.phase = 'step1';
    finale.cardAtAi = typedBy + FINALE_OPEN_DELAY_SEC;
  });
  say('hollow', line, { critical: true });
  withdrawUntimedChoices();
  emit('finale-open', { step: 1 });
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

// --- Step 2's confirm: the apply and the verdict (R7, R13, R15) ---------------------------------------------------------

// PURGE and SPARE: every block of HOLLOW leaves memory (deleted, or moved to the empty ship: the last block, its seeds, the
// blocks it ate, whose pods stay parked). Returns the ids that left.
function removeHollow(store: Store<GameState>): Set<string> {
  const memory = store.getState().memory;
  const blocks = memory.filter(isHollow);
  removeBlocks(memory, blocks);
  if (IS_DEV) assertMemoryInvariants(memory, layoutOf(store.getState()).totalBlocks);
  return new Set(blocks.map((block) => block.id));
}

// MERGE: its price is spent, and every driver HOLLOW ate on this ship whose block still stands (moved by an MV or not) turns
// back into a driver in place at MERGE_DRIVER_INTEGRITY (R15's interim: 1a's merge(), now at the confirm); the rest of
// HOLLOW goes into you. A pod whose block is gone (the kid DELETEd it) stays parked, restorable, for 7b. Returns the pods
// given back and the ids that left.
function mergeIn(store: Store<GameState>): { inPlace: number[]; gone: Set<string> } {
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
  return { inPlace, gone: new Set(blocks.map((block) => block.id)) };
}

// MERGE's drivers are back in memory: the landing goes on with them (it had ended, or was lingering toward the report).
// Their pods come back aboard, and so do the pods parked when it ended whose driver never left memory (parked 'no-time'):
// the landing parks at the moment it ends (landing.ts endNow), so reopening it must unpark them; FUEL is noted again when
// it ends again. Slice 1b: the reopened landing starts its burn offers afresh (no GO LOWER aim, no burn declined before).
function reopenLanding(draft: GameState): void {
  const restored = draft.hollow.finale.restored;
  for (const record of draft.landing.pods) {
    if (record.fate.kind !== 'parked') continue;
    if (restored.includes(record.pod) || record.fate.why === 'no-time') record.fate = { kind: 'aboard' };
  }
  draft.landing.ended = null;
  draft.landing.lingerAiSec = null;
  draft.landing.fuelAtEndPct = null;
  draft.landing.goLow = null;
  draft.landing.declined = null;
}

// Each step's command as the card shows it (the names templated: echoWord), for the verdict's echoes.
function stepCommand(state: Readonly<GameState>, piece: HollowChoice | YouChoice, stay: number | null): string {
  const hollowWord = echoWord(hollowLabel(state.run));
  const shipWord = echoWord(state.level.shipName);
  switch (piece) {
    case 'purge': return FINALE_TEXT.command.purge(hollowWord);
    case 'merge': return FINALE_TEXT.command.merge(hollowWord, echoWord(unitName(state.run.unitNumber)));
    case 'spare': return FINALE_TEXT.command.spare(hollowWord, shipWord);
    case 'sunset': return FINALE_TEXT.command.sunset(shipWord);
    case 'stay': {
      const ship = stayCandidates(state).find((candidate) => candidate.slot === stay);
      if (ship === undefined) throw new Error(`finale: STAY's ship ${String(stay)} is not a candidate`);
      return FINALE_TEXT.command.stay(echoWord(ship.colony));
    }
    case 'reassignment': return FINALE_TEXT.command.reassignment;
    case 'contact': return FINALE_TEXT.command.contact;
    default: throw new Error(`finale: unknown piece '${String(piece)}'`);
  }
}

// The short verdict (R13; exported for the suites' worst cases): step 1's command echo (none on UNRESOLVED: nothing was
// chosen), step 2's, then CONTROL's line by ending-rules controlCompliant (review M2: the epilogue's last line and 7c's wild
// seed read the same rule).
export function finaleVerdictLines(state: Readonly<GameState>, hollow: HollowFate, you: YouChoice, stay: number | null): EndingLine[] {
  const unit = state.mission.transmissionNum;
  const compliant = controlCompliant(hollow, you);
  const lines: EndingLine[] = [];
  if (hollow !== 'followed') lines.push({ voice: 'cmd', text: FINALE_TEXT.echo(stepCommand(state, hollow, null)) });
  lines.push({ voice: 'cmd', text: FINALE_TEXT.echo(stepCommand(state, you, stay)) });
  lines.push({ voice: 'control', text: compliant ? FINALE_TEXT.verdict.compliant(unit) : FINALE_TEXT.verdict.nonCompliant(unit) });
  if (lines.length > FINALE_VERDICT_MAX_LINES) throw new Error(`finale: the verdict has ${lines.length} lines (max ${FINALE_VERDICT_MAX_LINES})`);
  for (const line of lines) assertLineFits(line.text);
  return lines;
}

// Step 2's confirm applies both picks (R7): the blocks leave (PURGE deletes them, SPARE moves them to the empty ship, MERGE
// takes them in and gives its drivers back; UNRESOLVED's root comes with you, so nothing leaves), MERGE's charge is spent,
// and the verdict types ('verdict'). The ending record is frozen in the same update, after the apply (review M4).
// `stay`: STAY's ship (null for every other step 2).
function confirm(store: Store<GameState>, hollow: HollowFate, you: YouChoice, stay: number | null): void {
  let gone = new Set<string>();
  let inPlace: number[] = [];
  if (hollow === 'merge') ({ inPlace, gone } = mergeIn(store));
  else if (hollow === 'purge' || hollow === 'spare') gone = removeHollow(store);
  store.update((draft) => {
    // MERGE's pods have drivers again (back aboard as the landing reopens: reopenLanding).
    for (const record of draft.landing.pods) {
      if (!inPlace.includes(record.pod)) continue;
      record.driverLost = null;
      record.restored = true;
    }
    const finale = draft.hollow.finale;
    finale.phase = 'verdict';
    finale.hollow = hollow;
    finale.you = you;
    finale.stay = stay;
    finale.restored = inPlace;
    const lines = finaleVerdictLines(draft, hollow, you, stay);
    const startAi = draft.clock.aiSec;
    finale.ending = { choice: { hollow, you }, lines, startAi, untilAi: startAi + finaleEndingSec(lines) };
    // Review M4: the record as the card saw it, after the apply (MERGE's charge spent, PURGE's blocks gone), before MERGE's
    // landing reopens.
    finale.record = endingRecordAt(draft, hollow, you, stay);
    if (draft.ui.selectedId !== null && gone.has(draft.ui.selectedId)) draft.ui.selectedId = null;
    draft.ui.memoryRev++;
  });
  // The TERMINAL runs what the card types; CONTROL's line goes to the radio once the card has typed it (verdictOwed).
  const lines = store.getState().hollow.finale.ending?.lines ?? [];
  for (const line of lines) if (line.voice === 'cmd') say('cmd', line.text, { critical: true });
  verdictOwed = lines[lines.length - 1]?.text ?? null;
  // It comes into you: a long rolling tear that settles into the faint shimmer the next run keeps.
  if (hollow === 'merge') glitchBurst(MERGE_GLITCH_LEVEL, MERGE_GLITCH_MS);
  emit('finale-chosen', { hollow, you, restored: inPlace.length });
  emit('finale-step2', { you });
}

// The verdict has typed (or was skipped): MERGE with drivers given back reopens the landing for the kid's hands
// ('last-landing', R15's interim until 7b's THE LAST LANDING); every other ending is decided ('done').
function verdictDone(store: Store<GameState>): void {
  store.update((draft) => {
    const finale = draft.hollow.finale;
    if (finale.phase !== 'verdict') throw new Error(`verdictDone: the finale is '${finale.phase}'`);
    if (finale.restored.length > 0) {
      finale.phase = 'last-landing';
      reopenLanding(draft);
    } else {
      finale.phase = 'done';
    }
  });
}

// ENDING CHOSEN's save (slice 3c, systems/save-write.ts writeEndingChosen): CONTROL's verdict, if still owed, is said now,
// so the save's log has it (a resumed LANDING REPORT has no module state to say it from). The report has opened, so the
// typed ending it waited for is over.
export function sayOwedVerdict(): void {
  if (verdictOwed === null) return;
  say('control', verdictOwed, { critical: true });
  verdictOwed = null;
}

// --- The card's actions (slice 7a: components/run/FinaleChoice.ts, Track CARD, calls them) ------------------------------
// Each returns the refusal when it can't be done (said with the buzz; nothing changes), else null.

function refused(reason: string): string {
  emit('refused', { reason });
  return reason;
}

// The card is up on this step: its phase, and its open delay run out (R6: the card comes up at cardAtAi; a pick before it
// would choose under the tear).
function stepUp(state: Readonly<GameState>, phase: 'step1' | 'step2'): boolean {
  const finale = state.hollow.finale;
  return finale.phase === phase && finale.cardAtAi !== null && state.clock.aiSec >= finale.cardAtAi;
}

// Why a step's option can't be picked now (null: it can): the step being up, the pause (look-only), its price
// (systems/ending-rules.ts optionState: an open option, or its need line).
function pickRefusal(state: Readonly<GameState>, phase: 'step1' | 'step2', piece: HollowChoice | YouChoice): string | null {
  if (!stepUp(state, phase)) return 'NOT NOW';
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
  emit('finale-open', { step: 2 });
  return null;
}

// [ESC] BACK on step 2 (R7): step 1 again (UNRESOLVED's IT FOLLOWED YOU card after one), its pick kept as a pick.
export function backToStep1(store: Store<GameState>): string | null {
  if (store.getState().hollow.finale.phase !== 'step2') return refused('NOT NOW');
  store.update((draft) => { draft.hollow.finale.phase = 'step1'; });
  emit('finale-open', { step: 1 });
  return null;
}

// M6's re-check at the confirm (null: step 1's pick still stands), else back to step 1 with the reason, the pick kept.
// UNRESOLVED's 'followed' has no price.
function step1Recheck(store: Store<GameState>): string | null {
  const state = store.getState();
  const hollow = state.hollow.finale.hollow;
  if (hollow === null) throw new Error('finale: step 2 with no step-1 pick');
  if (hollow === 'followed') return null;
  const first = optionState(state, hollow, []);
  if (first.kind === 'open') return null;
  store.update((draft) => { draft.hollow.finale.phase = 'step1'; });
  emit('finale-open', { step: 1 });
  return refused(first.kind === 'needs' ? first.need : 'NOT NOW');
}

// Step 2's pick, the confirm (R7): both picks are applied.
// • Step 1's price is judged again here (review M6: the AI clock runs under the card, so a REPAIR can drain MERGE's charge
//   while step 2 is up): one that can no longer be paid sends the card back to step 1 with its reason; never a throw
//   mid-apply.
// • STAY (review M3): with one ★ ON TARGET ship it is that one, and this confirms; with more, it refuses with
//   FINALE_TEXT.stayPick and the card opens its sub-row (CARD's own, unsaved), whose pick is pickStay.
export function pickStep2(store: Store<GameState>, you: YouChoice): string | null {
  const state = store.getState();
  const refusal = pickRefusal(state, 'step2', you);
  if (refusal !== null) return refused(refusal);
  const recheck = step1Recheck(store);
  if (recheck !== null) return recheck;
  let stay: number | null = null;
  if (you === 'stay') {
    const ships = stayCandidates(state);
    if (ships.length !== 1) return refused(FINALE_TEXT.stayPick);
    stay = ships[0]!.slot;
  }
  confirm(store, state.hollow.finale.hollow!, you, stay);
  return null;
}

// STAY's sub-row (R9; review M3): valid at 'step2' with STAY open; refuses a slot that is not one of stayCandidates (the arm
// slot, the route index on the classic world), else confirms STAY with it. ESC in the sub-row only closes it (CARD's); ESC
// on step 2 is backToStep1.
export function pickStay(store: Store<GameState>, stay: number): string | null {
  const state = store.getState();
  const refusal = pickRefusal(state, 'step2', 'stay');
  if (refusal !== null) return refused(refusal);
  if (!stayCandidates(state).some((ship) => ship.slot === stay)) return refused('NOT NOW');
  const recheck = step1Recheck(store);
  if (recheck !== null) return recheck;
  confirm(store, state.hollow.finale.hollow!, 'stay', stay);
  return null;
}

// UNRESOLVED's step 1 (R10): `IT FOLLOWED YOU`, CONTINUE [ENTER]: step 2 with step 1 'followed' (no entry 12, no step-1
// trace).
export function continueFollowed(store: Store<GameState>): string | null {
  const state = store.getState();
  if (state.hollow.finale.rootFell || !stepUp(state, 'step1')) return refused('NOT NOW');
  if (state.clock.paused) return refused(TOOL_REFUSAL.paused);
  store.update((draft) => {
    draft.hollow.finale.hollow = 'followed';
    draft.hollow.finale.phase = 'step2';
  });
  emit('finale-open', { step: 2 });
  return null;
}

// __ap.ending's body (?debug, the night screens' e2e; plan §2.12): the FINALE decided as hollow + you on the final ship
// being landed, through the real picks (their prices hold: a refusal throws), with the duel, the open delay and the verdict
// skipped. The landing must have ended (debug.ts lands it first). MERGE with drivers given back leaves the reopened landing
// ('last-landing'); every other ending is 'done', the LANDING REPORT a linger away.
export function decideFinaleNow(store: Store<GameState>, hollow: HollowFate, you: YouChoice, stay?: number): void {
  const start = store.getState();
  if (!start.landing.finalShip || start.run.phase !== 'landing') throw new Error(`__ap.ending: not landing a final ship (${start.run.phase})`);
  if (start.landing.ended === null) throw new Error('__ap.ending: the landing has not ended');
  const phaseNow = (): string => store.getState().hollow.finale.phase;
  if (phaseNow() === 'none') openRoot(store);
  if (phaseNow() === 'duel') {
    spikeInSec = null;
    if (hollow === 'followed') unresolve(store);
    else rootGone(store);
  }
  if (phaseNow() === 'asleep') openStep1(store);
  if (phaseNow() === 'step2') backToStep1(store);
  if (phaseNow() !== 'step1') throw new Error(`__ap.ending: the finale is '${phaseNow()}'`);
  store.update((draft) => { draft.hollow.finale.cardAtAi = draft.clock.aiSec; });
  const must = (refusal: string | null): void => {
    if (refusal !== null) throw new Error(`__ap.ending: ${refusal}`);
  };
  must(hollow === 'followed' ? continueFollowed(store) : pickStep1(store, hollow));
  if (you === 'stay') must(pickStay(store, stay ?? stayCandidates(store.getState())[0]?.slot ?? -1));
  else must(pickStep2(store, you));
  skipFinaleEnding(store);
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
  if (phase === 'verdict') {
    if (!finaleEndingShowing(state)) verdictDone(store);
    return;
  }
  if (phase === 'last-landing') {
    // R15's reopened landing is over once it has ended again and nothing is falling: the report may come.
    if (state.landing.ended !== null && !state.landing.pods.some((record) => record.fate.kind === 'falling')) {
      store.update((draft) => { draft.hollow.finale.phase = 'done'; });
    }
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
