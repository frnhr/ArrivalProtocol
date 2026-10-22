import type { Store } from '@state/store';
import type { GameState, RunEndCause, ClusterResult, EndingLine, FinaleEnding } from '@state/schema';
import type { HollowSegment, Segment, SoulSegment } from '@/types/segment';
import { onAiTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { emit, NO_PAYLOAD } from '@systems/events';
import { glitchBurst } from '@systems/glitch';
import { getOpsBySeg, abortOp } from '@systems/ops-core';
import { say, hollowLabel, unitName, assertLineFits, mindTypedByAi, typingSec } from '@systems/say';
import { theRoot, rootDeleteRunning, rootDeleteProgress, nameHollow } from '@systems/hollow';
import { clearAlert, VERB_ALERT_ID, SEED_ALERT_ID } from '@systems/alerts';
import { replaceRange, mergeAdjacentFree, requireAddr, freeSegment, assertMemoryInvariants } from '@systems/memory-ops';
import { spendCharge, cureInfection } from '@state/actions';
import { soulsInMemory, getFsTool, chargeLeft, infectedSegments, isHollow, integrityState, soulCounts } from '@state/selectors';
import { echoWord, TOOL_REFUSAL } from '@data/tool-text';
import { getShip, SHIPS } from '@data/ships';
import { fleetHome } from '@systems/run-score';
import { MEMORY_TOTAL_BLOCKS } from '@data/memory';
import { HOLLOW_FINALE } from '@data/hollow-text';
import { IS_DEV } from '@/env';
import { formatCount } from '@data/format';
import {
  MERGE_COST_CHARGE, MERGE_RESTORE_INTEGRITY, CLUSTER_BLOCKS, GLITCH_BURST_LEVEL, GLITCH_BURST_MS,
  DUEL_SPIKE_EVERY_START_SEC, DUEL_SPIKE_EVERY_END_SEC, DUEL_SPIKE_LEVEL_START, DUEL_SPIKE_LEVEL_END, DUEL_SPIKE_MS,
  ROOT_GONE_GLITCH_LEVEL, ROOT_GONE_GLITCH_MS, MERGE_GLITCH_LEVEL, MERGE_GLITCH_MS, FINALE_ENDING_MAX_LINES,
  FINALE_ENDING_CPS, FINALE_ENDING_GAP_SEC, FINALE_ENDING_HOLD_SEC, CONTROL_CHIME_LEAD_SEC,
} from '@data/tuning';

// LAST LIGHT's finale (§1, §4.3, §6.6, §9 WP11 items 4–5), DOM-free. The flagship's ship ends here, and so does the run.
// • THE DUEL. As the flagship's orbit is locked or accepted (the ship goes into 'printing'), its root opens: no longer
//   LOCKED, ARRIVAL CONTROL says "Please delete UNIT-046. :)", and the strip says DELETE THE ROOT. Its DELETE is one
//   ROOT_DELETE_SEC op (state/actions.ts), during which HOLLOW's verbs come every duelEverySec (systems/hollow-verbs.ts);
//   the running DELETE keeps its thread whatever the Core does (ops-core never takes a thread back). Printing goes on
//   meanwhile, and the WAKE REPORT waits for the finale (systems/printer.ts, finalePending): a ship whose colonists
//   all printed before the root's end waits with `EVERYONE IS PRINTED — now DELETE THE ROOT`.
// • THE LAST BLOCK. The DELETE leaves one block in the root's middle (data/memory.ts rootRemains). HOLLOW stops: no
//   more bites, seeds or verbs (it sleeps), and what it was eating it lets go, cured where it stands. (§6.6 says only
//   that spread and seeds stop; a dead root's teeth drained on while the kid read the choice, which is no choice at
//   all. WP11 deviation.) In its pink: `> 047. wait.` Then PURGE or MERGE.
// • PURGE: every block of HOLLOW leaves memory (the last block, its seeds, the blocks it ate: their colonists did not
//   wake), clean and a little cold: `> rm unit_046 ... OK`, and CONTROL thanks Unit 47 and stands it by for reassignment.
// • MERGE: needs MERGE_COST_CHARGE REPAIR CHARGE (refused with `NEEDS 20 CHARGE (you have 14)` below it) and costs it.
//   Every cluster HOLLOW ate on this ship comes back: its block turns back into colonists in place at
//   MERGE_RESTORE_INTEGRITY if it still stands (moved by an MV or not), and prints like any cluster (waking with missing
//   memories), else (the kid DELETEd it) it goes into the record straight away as woke with missing memories: half
//   credit, and nobody HOLLOW ate is dropped. Its other blocks go with it into you: `> merge unit_046 -> unit_047 ...
//   OK`, and CONTROL calls Unit 47 non-compliant. The next run carries the merge (systems/meta.ts: 'won-merge').
// • UNRESOLVED (§4.3): printing is over, the root still stands, no DELETE of it is running, and nothing can delete it
//   (no working Rm, and none a REPAIR could bring back): the ship ends unresolved. `> you can't delete me now.`
// RUN END's cause after the flagship's WAKE REPORT is finaleRunCause.
// WP11 part 2 (the moment's look and sound live in the views; this keeps their timing on AI time, DOM-free):
// • THE SPIKES. The root opening tears the screen once (a verb's glitchBurst); while its DELETE runs HOLLOW thrashes:
//   a spike every DUEL_SPIKE_EVERY_START_SEC quickening to DUEL_SPIKE_EVERY_END_SEC, stronger the nearer the DELETE is
//   to done ('duel-spike' carries the progress for the sound); its end is the biggest tear of the game.
// • THE ENDING. PURGE and MERGE each write their typed ending (≤ FINALE_ENDING_MAX_LINES lines, from live numbers:
//   finaleEndingLines) into hollow.finale.ending, in the same store update as the choice's phase (WP11 review: written
//   one update later, the card saw a chosen finale with no ending, closed, and came back late or never), with the AI
//   seconds it starts and until which it holds the WAKE REPORT back (finaleEndingSec: the lines' typing at
//   FINALE_ENDING_CPS, the gaps, CONTROL's chime and a hold to read). The FinaleChoice card types it on that clock;
//   skipFinaleEnding (a click or a key) lets the report come at once.

export type FinaleChoice = 'purge' | 'merge';

function isFlagship(state: Readonly<GameState>): boolean {
  return getShip(state.run.shipIndex).flagship;
}

// How the run ends after the flagship's WAKE REPORT (systems/run.ts continueAfterReport).
export function finaleRunCause(state: Readonly<GameState>): RunEndCause {
  switch (state.hollow.finale.phase) {
    case 'purged': return 'won-purge';
    case 'merged': return 'won-merge';
    case 'unresolved': return 'unresolved';
    default: throw new Error(`finaleRunCause: the finale is '${state.hollow.finale.phase}', not decided`);
  }
}

// The `MERGE 20` tick the charge readouts carry on the flagship (§7.1 `.mem-stats`, §9 WP11 item 1): MERGE's price, while
// the choice is still ahead (null on every other ship, and once the finale is decided). Part 2 draws it.
export function mergeTickCharge(state: Readonly<GameState>): number | null {
  if (!isFlagship(state)) return null;
  const phase = state.hollow.finale.phase;
  return phase === 'none' || phase === 'duel' || phase === 'choice' ? MERGE_COST_CHARGE : null;
}

// Something can still delete the root: a working Rm, or an Rm a REPAIR can bring back (a working Repair and charge).
export function rootDeletable(state: Readonly<GameState>): boolean {
  if (getFsTool(state, 'delete')) return true;
  const anyRm = state.memory.some((seg) => seg.type === 'fs-tool' && seg.fsTool === 'delete');
  return anyRm && getFsTool(state, 'repair') !== undefined && chargeLeft(state) >= 1;
}

// Why a choice can't be made now (null: it can). MERGE needs its price (§9 WP11 item 5).
export function finaleChoiceRefusal(state: Readonly<GameState>, choice: FinaleChoice): string | null {
  if (state.hollow.finale.phase !== 'choice') return 'NOT NOW';
  if (state.clock.paused) return TOOL_REFUSAL.paused;
  if (choice === 'merge' && chargeLeft(state) < MERGE_COST_CHARGE) return HOLLOW_FINALE.mergeNeeds(chargeLeft(state));
  return null;
}

// --- The typed endings (§9 WP11 item 5) ------------------------------------------------------------------------------

// The people on this ship who will wake, everyone HOLLOW did not eat or the belt did not take: printed already (heads)
// or still in memory (printing only moves them from one to the other, so the number holds while the ending types).
function soulsInOrbit(state: Readonly<GameState>): number {
  const counts = soulCounts(state);
  return counts.heads + counts.inMemory;
}

// The clusters HOLLOW ate on this ship that are still lost: what MERGE would bring back, and what PURGE leaves lost
// (FinaleChoice names them on its buttons).
export function clustersEatenHere(state: Readonly<GameState>): ClusterResult[] {
  return state.souls.results.filter((result) => result.eaten === true && result.outcome === 'lost');
}

function soulsEatenHere(state: Readonly<GameState>): number {
  return clustersEatenHere(state).reduce((sum, result) => sum + result.souls, 0);
}

// The typed ending a choice just made writes, from the world as it is right after it.
export function finaleEndingLines(state: Readonly<GameState>, choice: FinaleChoice): EndingLine[] {
  const hollowWord = echoWord(hollowLabel(state.run));
  const inOrbit = soulsInOrbit(state);
  const shipName = state.level.shipName;
  const unit = state.mission.transmissionNum;
  let lines: EndingLine[];
  if (choice === 'purge') {
    const eaten = soulsEatenHere(state);
    // The flagship is in orbit (its finale opens only at a lock or an accept) but not recorded until its WAKE REPORT.
    const fleet = fleetHome(state.run.ships, SHIPS.length, state.level.shipId);
    lines = HOLLOW_FINALE.purgeEnding({
      shipName, inOrbit: formatCount(inOrbit), anyoneHome: inOrbit > 0, eaten: eaten > 0 ? formatCount(eaten) : null, hollowWord, unit,
      shipsHome: fleet.home, fleetSize: fleet.total,
    });
  } else {
    const { restoredInPlace, restoredHalf } = state.hollow.finale;
    const restoredCodes = new Set([...restoredInPlace, ...restoredHalf]);
    // Back in memory (in place) or woke at once (half): every one of them is counted in inOrbit now.
    const restored = state.souls.results.filter((result) => result.merged === true).reduce((sum, result) => sum + result.souls, 0)
      + soulsInMemory(state).filter((soul) => restoredCodes.has(soul.cluster)).reduce((sum, soul) => sum + soul.souls, 0);
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
function endingFor(state: Readonly<GameState>, choice: FinaleChoice): FinaleEnding {
  const lines = finaleEndingLines(state, choice);
  const startAi = state.clock.aiSec;
  return { choice, lines, startAi, untilAi: startAi + finaleEndingSec(lines) };
}

// The kid ended the typed ending early (FinaleChoice: a click, SPACE or ENTER once it has typed): the WAKE REPORT may
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

// The typed ending is on screen now (FinaleChoice shows it; the WAKE REPORT waits for it).
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
// that never said who it is (only a unit that skipped HALCYON: ?debug, a suite) is named here first.
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

// The root's DELETE completed (one last block stands where it was): HOLLOW stops, and lets go of what it was eating.
function rootGone(store: Store<GameState>): void {
  const cured = infectedSegments(store.getState());
  store.update((draft) => {
    draft.hollow.finale.phase = 'choice';
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
}

// HOLLOW's last line holds the WAKE REPORT until it has typed in the TERMINAL (after whatever the TERMINAL is still
// typing: the same sum say.ts keeps) and been read, like the typed endings (WP11 review: the report came 1.5 s after the
// last print and cut it off at `> you can't delete`).
function unresolve(store: Store<GameState>): void {
  const state = store.getState();
  const line = HOLLOW_FINALE.unresolvedLine;
  const typedBy = Math.max(mindTypedByAi(state), state.clock.aiSec) + typingSec('hollow', line);
  store.update((draft) => {
    draft.hollow.finale.phase = 'unresolved';
    draft.hollow.finale.unresolvedUntilAi = typedBy + FINALE_ENDING_HOLD_SEC;
  });
  say('hollow', line, { critical: true });
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

// A cluster HOLLOW ate, back from its record (the people the record kept), at MERGE_RESTORE_INTEGRITY.
function soulFromRecord(result: Readonly<ClusterResult>): SoulSegment {
  return {
    id: `soul_${result.cluster.toLowerCase()}`,
    name: `${result.cluster} · ${result.family}`,
    type: 'soul',
    size: CLUSTER_BLOCKS,
    integrity: MERGE_RESTORE_INTEGRITY,
    state: integrityState(MERGE_RESTORE_INTEGRITY),
    cluster: result.cluster,
    family: result.family,
    souls: result.souls,
    featured: result.featured,
    sealed: false,
  };
}

function purge(store: Store<GameState>): void {
  const memory = store.getState().memory;
  const blocks = memory.filter(isHollow);
  removeBlocks(memory, blocks);
  if (IS_DEV) assertMemoryInvariants(memory, MEMORY_TOTAL_BLOCKS);
  const gone = new Set(blocks.map((block) => block.id));
  store.update((draft) => {
    draft.hollow.finale.phase = 'purged';
    draft.hollow.finale.ending = endingFor(draft, 'purge');
    if (draft.ui.selectedId !== null && gone.has(draft.ui.selectedId)) draft.ui.selectedId = null;
    draft.ui.memoryRev++;
  });
  const state = store.getState();
  say('cmd', HOLLOW_FINALE.purgeEcho(echoWord(hollowLabel(state.run))), { critical: true });
  verdictOwed = HOLLOW_FINALE.purgeControl(state.mission.transmissionNum);
  emit('finale-chosen', { choice: 'purge', restoredInPlace: 0, restoredHalf: 0 });
}

function merge(store: Store<GameState>): void {
  spendCharge(store, MERGE_COST_CHARGE);
  const state = store.getState();
  const memory = state.memory;
  const eaten = clustersEatenHere(state);
  const blocks = memory.filter(isHollow);
  for (const block of blocks) for (const operation of getOpsBySeg(block.id)) abortOp(operation.id);
  const inPlace: string[] = [];
  const half: string[] = [];
  for (const result of eaten) {
    const block = memory.find((seg): seg is HollowSegment => isHollow(seg) && seg.ateCluster === result.cluster);
    if (block === undefined) { half.push(result.cluster); continue; }
    if (block.size !== CLUSTER_BLOCKS) throw new Error(`finale: ${result.cluster}'s block is ${block.size} blocks, not a cluster's`);
    const start = requireAddr(memory, block);
    replaceRange(memory, start, start + block.size, [soulFromRecord(result)], { opId: null, own: [block] });
    inPlace.push(result.cluster);
  }
  removeBlocks(memory, memory.filter(isHollow));
  if (IS_DEV) assertMemoryInvariants(memory, MEMORY_TOTAL_BLOCKS);
  const gone = new Set(blocks.map((block) => block.id));
  store.update((draft) => {
    // Back in memory: their 'did not wake' records go (they will print). Gone for good: woke, with missing memories.
    draft.souls.results = draft.souls.results.filter((result) => !(result.eaten === true && inPlace.includes(result.cluster)));
    for (const result of draft.souls.results) {
      if (result.eaten !== true || !half.includes(result.cluster)) continue;
      result.outcome = 'gaps';
      result.integrity = MERGE_RESTORE_INTEGRITY;
      result.merged = true;
    }
    draft.hollow.finale = { phase: 'merged', restoredInPlace: inPlace, restoredHalf: half, ending: null, unresolvedUntilAi: null };
    // Its numbers count the clusters just given back (in memory now, or in the record as woke).
    draft.hollow.finale.ending = endingFor(draft, 'merge');
    // Colonists back in memory: the printer goes on with them (it may have been lingering toward the report).
    if (inPlace.length > 0) draft.printer.lingerAiSec = null;
    if (draft.ui.selectedId !== null && gone.has(draft.ui.selectedId)) draft.ui.selectedId = null;
    draft.ui.memoryRev++;
  });
  const after = store.getState();
  say('cmd', HOLLOW_FINALE.mergeEcho(echoWord(hollowLabel(after.run)), echoWord(unitName(after.run.unitNumber))), { critical: true });
  verdictOwed = HOLLOW_FINALE.mergeControl(after.mission.transmissionNum);
  // It comes into you: a long rolling tear that settles into the faint shimmer the next run keeps.
  glitchBurst(MERGE_GLITCH_LEVEL, MERGE_GLITCH_MS);
  emit('finale-chosen', { choice: 'merge', restoredInPlace: inPlace.length, restoredHalf: half.length });
}

// PURGE or MERGE (FinaleChoice's buttons). Returns the refusal when it can't be made (nothing changes then).
export function chooseFinale(store: Store<GameState>, choice: FinaleChoice): string | null {
  const refusal = finaleChoiceRefusal(store.getState(), choice);
  if (refusal !== null) {
    emit('refused', { reason: refusal });
    return refusal;
  }
  if (choice === 'purge') purge(store);
  else merge(store);
  return null;
}

function tick(store: Store<GameState>, dtAi: number): void {
  const state = store.getState();
  // Before the phase test: the ending's last tick can be the one the printer moves to the WAKE REPORT in.
  if (verdictOwed !== null && !finaleEndingShowing(state)) {
    say('control', verdictOwed, { critical: true });
    verdictOwed = null;
  }
  if (!isFlagship(state) || state.run.coreLost || state.run.phase !== 'printing') return;
  const phase = state.hollow.finale.phase;
  if (phase === 'none') {
    openRoot(store);
    return;
  }
  if (phase !== 'duel') return;
  if (theRoot(state.memory) === null) {
    spikeInSec = null;
    rootGone(store);
    return;
  }
  stepSpikes(state, dtAi);
  if (soulsInMemory(state).length === 0 && !rootDeleteRunning(state) && !rootDeletable(state)) unresolve(store);
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
