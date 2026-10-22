import type { Store } from '@state/store';
import type { GameState, VerbTelegraph } from '@state/schema';
import type { HollowSegment, Segment } from '@/types/segment';
import type { Rng } from '@systems/rng';
import { onAiTick, onPostTick, isLivePhase } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { emit } from '@systems/events';
import { onOpsChange, getOpsBySeg, canStartOp } from '@systems/ops-core';
import { raiseAlert, clearAlert, VERB_ALERT_ID } from '@systems/alerts';
import { say, hollowLabel } from '@systems/say';
import { childRng } from '@systems/rng';
import { glitchBurst } from '@systems/glitch';
import { chooseVerb, landVerb, verbWeights, rootDeleteRunning, type Verb } from '@systems/hollow';
import { assertMemoryInvariants } from '@systems/memory-ops';
import { fileLabel, isHollow, verbSecondsLeft } from '@state/selectors';
import { echoName, echoWord } from '@data/tool-text';
import { MEMORY_TOTAL_BLOCKS } from '@data/memory';
import { HOLLOW_VERB } from '@data/hollow-text';
import { IS_DEV } from '@/env';
import { GLITCH_BURST_LEVEL, GLITCH_BURST_MS } from '@data/tuning';

// HOLLOW's verbs (§1 finale, §5.3 moment 13, §6.6, §9 WP11 item 2), DOM-free: on a ship whose HOLLOW has verbs (LAST
// LIGHT) it fights with your own tools.
// • THE CLOCK. Once HOLLOW is awake, every verbs.everySec (verbInSec), or every duelEverySec while the root's DELETE runs
//   (the duel), HOLLOW picks a verb (systems/hollow.ts chooseVerb, weighted by the last unit's habits). The clock stands
//   still while the flight is at TACTICAL (a burn, its last seconds, the belt, an alarm): like every ship's first seed
//   (WP9, lead-signed), a verb never lands under a NOW / KEEP HOLDING / RELEASE line, so the kid always has the calm to
//   block it. While printing (the duel) it always runs. One telegraph at a time: the clock counts from one telegraph's
//   start to the next (ships.ts validates that the countdown fits).
// • THE TELEGRAPH. For telegraphSec it counts down in your TERMINAL in its pink (`> rm repair.bak ... 3`), the strip says
//   BLOCK IT (data/script.ts), and a warning holds SKIP. Its countdown stands still under TACTICAL like the clock.
// • THE COUNTER (§6.6). Any op started on the target meanwhile, or one already running on it, blocks the verb at once:
//   `> rm repair.bak ... BLOCKED` and 'verb-blocked' (the stamp). Any op will do: a SCAN is the cheap one, and a DELETE
//   on an MV's block also takes the block away. So a verb is only telegraphed while the kid has a thread free to start
//   that op (the lead's ruling of 20:55, WP11 review: in the duel the root's DELETE held a 1-thread Core's only thread,
//   and every verb landed under `BLOCK IT`): with none free, HOLLOW skips its turn (no telegraph, no echo) and tries
//   again at the next one. A thread free at the telegraph that the kid then fills is the kid's choice; a tool click on
//   the target refused for threads then says how to block it (state/actions.ts).
// • THE VERB. Otherwise it lands when the countdown runs out, re-checked on memory as it is then (landVerb: a file no
//   longer a fair target, or a block with nowhere left to go, fails: `... FAILED`), as one structural change followed by
//   the invariants, then the echo `> rm repair.bak   [user: UNIT-046]` and glitchBurst(0.3, 400).
// Once HOLLOW sleeps (its root is gone: systems/finale.ts) a countdown still standing is called off without effect.
// Runs on the AI tick after HOLLOW's (this tick's bite and seed are in).

// An op touched the counting-down verb's target since its telegraph began (heard on the ops core, acted on in the tick:
// an op started and cancelled between two ticks still blocks it).
let touched = false;
let verbRng: Rng | null = null;

function resetVerbs(): void {
  touched = false;
  verbRng = null;
}

function rngFor(state: Readonly<GameState>): Rng {
  if (!verbRng) verbRng = childRng(state.run.seed, state.run.shipIndex, 'verbs');
  return verbRng;
}

// The words an MV's block goes by: in HOLLOW's echo (`seed`, `c13`: what it ate) and on the strip (`its SEED`, `the
// block that ATE C13`).
function mvWords(block: Readonly<HollowSegment>): { word: string; label: string } {
  if (block.seed) return { word: HOLLOW_VERB.mvSeedWord, label: HOLLOW_VERB.mvSeedLabel };
  const ate = block.ateCluster ?? block.ate;
  if (ate === undefined) throw new Error(`hollow-verbs: MV's block ${block.id} is neither a seed nor an eaten file`);
  return { word: echoWord(ate), label: HOLLOW_VERB.mvAteLabel(ate.toUpperCase()) };
}

function telegraphOf(verb: Readonly<Verb>, target: Readonly<Segment>, telegraphSec: number): VerbTelegraph {
  if (verb.kind === 'rm') {
    return { kind: 'rm', targetId: target.id, targetWord: echoName(target), targetLabel: fileLabel(target), toAddr: null, leftSec: telegraphSec };
  }
  if (!isHollow(target)) throw new Error(`hollow-verbs: MV aims at ${target.name}, which is not HOLLOW's`);
  const { word, label } = mvWords(target);
  return { kind: 'mv', targetId: target.id, targetWord: word, targetLabel: label, toAddr: verb.toAddr, leftSec: telegraphSec };
}

// Its moment has come: a verb (or none, when nothing is a fair target, or no thread is free to block it with: HOLLOW skips
// its turn, §6.6 and the lead's ruling). A skipped turn still counts as a moment (SKIP waits only for the first: pace.ts).
function startVerb(store: Store<GameState>, telegraphSec: number): void {
  const state = store.getState();
  const verb = canStartOp()
    ? chooseVerb(state.memory, rngFor(state), verbWeights(state.run.lastUnit), state.hollow.untriedTools)
    : null;
  const target = verb === null ? undefined : state.memory.find((seg) => seg.id === verb.targetId);
  if (verb !== null && target === undefined) throw new Error(`hollow-verbs: chose ${verb.targetId}, which is not in memory`);
  const telegraph = verb === null || target === undefined ? null : telegraphOf(verb, target, telegraphSec);
  store.update((draft) => {
    draft.hollow.verbMoments++;
    draft.hollow.verb = telegraph;
  });
  if (telegraph === null) return;
  touched = false;
  // The TERMINAL counts this line's number down live (MindTerminal, WP11 part 2) while the verb stands.
  say('hollow-cmd', HOLLOW_VERB.telegraph(telegraph.kind, telegraph.targetWord, verbSecondsLeft(telegraph)), { critical: true, verbCountdown: true });
  raiseAlert(store, { id: VERB_ALERT_ID, layer: 'mind', severity: 'warn', text: HOLLOW_VERB.alert(telegraph.kind), inhibitsSkip: true });
  emit('verb-telegraph', { kind: telegraph.kind, targetId: telegraph.targetId });
}

function endTelegraph(store: Store<GameState>, landed: boolean | null): void {
  store.update((draft) => {
    draft.hollow.verb = null;
    if (landed === true) draft.hollow.verbsLanded++;
  });
  touched = false;
  clearAlert(store, VERB_ALERT_ID);
}

function block(store: Store<GameState>, telegraph: Readonly<VerbTelegraph>): void {
  store.update((draft) => { draft.hollow.verbsBlocked++; });
  endTelegraph(store, null);
  say('hollow-cmd', HOLLOW_VERB.blocked(telegraph.kind, telegraph.targetWord), { critical: true, tone: 'good' });
  emit('verb-blocked', { kind: telegraph.kind, targetId: telegraph.targetId });
}

function land(store: Store<GameState>, telegraph: Readonly<VerbTelegraph>): void {
  const verb: Verb = telegraph.kind === 'rm'
    ? { kind: 'rm', targetId: telegraph.targetId }
    : { kind: 'mv', targetId: telegraph.targetId, toAddr: telegraph.toAddr };
  const memory = store.getState().memory;
  const landed = landVerb(memory, verb, store.getState().hollow.untriedTools);
  if (IS_DEV) assertMemoryInvariants(memory, MEMORY_TOTAL_BLOCKS);
  if (landed) {
    store.update((draft) => {
      draft.ui.memoryRev++;
      // An RM'd file is gone: nothing the kid pointed at stays pointed at it (a held tool re-finds its copy: fs-tools).
      if (telegraph.kind === 'rm') {
        if (draft.ui.selectedId === telegraph.targetId) draft.ui.selectedId = null;
        if (draft.ui.pickedSourceId === telegraph.targetId) draft.ui.pickedSourceId = null;
      }
    });
  }
  endTelegraph(store, landed);
  const user = hollowLabel(store.getState().run);
  if (!landed) {
    say('hollow-cmd', HOLLOW_VERB.failed(telegraph.kind, telegraph.targetWord, user), { critical: true });
    emit('verb-failed', { kind: telegraph.kind, targetId: telegraph.targetId });
    return;
  }
  say('hollow-cmd', HOLLOW_VERB.done(telegraph.kind, telegraph.targetWord, user), { critical: true, tone: 'danger' });
  glitchBurst(GLITCH_BURST_LEVEL, GLITCH_BURST_MS);
  emit('verb-landed', { kind: telegraph.kind, targetId: telegraph.targetId });
}

// The flight is busy (TACTICAL): the verbs wait (see the header). Printing is never "busy" here: the duel is fought there.
function verbsHeld(state: Readonly<GameState>): boolean {
  return state.run.phase === 'flight' && state.clock.pace === 'tactical';
}

function tick(store: Store<GameState>, dtAi: number): void {
  const state = store.getState();
  const cfg = state.hollow.cfg.verbs;
  if (cfg === null || !isLivePhase(state)) return;
  const telegraph = state.hollow.verb;
  if (state.hollow.phase !== 'awake') {
    // HOLLOW stopped (the root is gone): a countdown still standing comes to nothing.
    if (telegraph !== null) endTelegraph(store, null);
    return;
  }
  const held = verbsHeld(state);
  if (telegraph !== null) {
    if (touched || getOpsBySeg(telegraph.targetId).length > 0) block(store, telegraph);
    else if (!held) {
      const leftSec = telegraph.leftSec - dtAi;
      if (leftSec <= 0) land(store, telegraph);
      else store.mutate((draft) => { if (draft.hollow.verb) draft.hollow.verb.leftSec = leftSec; });
    }
  }
  const duel = rootDeleteRunning(store.getState());
  let inSec = state.hollow.verbInSec ?? cfg.everySec;
  if (!held) inSec -= dtAi;
  if (duel) inSec = Math.min(inSec, cfg.duelEverySec);
  // A countdown never starts on a busy flight, even with the clock already out (a ?debug verbNow, or a clock that ran
  // out on the tick the pace turned TACTICAL): it waits for the calm.
  if (!held && inSec <= 0 && store.getState().hollow.verb === null && store.getState().hollow.phase === 'awake') {
    inSec = duel ? cfg.duelEverySec : cfg.everySec;
    startVerb(store, cfg.telegraphSec);
  }
  const next = Math.max(0, inSec);
  store.mutate((draft) => { draft.hollow.verbInSec = next; });
}

// ?debug and tests: HOLLOW's next verb now (its clock run out), on a ship whose HOLLOW has verbs and is awake.
export function verbNow(store: Store<GameState>): void {
  const state = store.getState();
  if (state.hollow.cfg.verbs === null) throw new Error(`verbNow: ${state.level.shipName}'s HOLLOW has no verbs`);
  if (state.hollow.phase !== 'awake') throw new Error(`verbNow: HOLLOW is ${state.hollow.phase}, not awake`);
  if (state.hollow.verb !== null) throw new Error('verbNow: a verb is already counting down');
  store.mutate((draft) => { draft.hollow.verbInSec = 0; });
}

let mounted = false;

// Mount after HOLLOW (its AI tick runs first: a bite or a seed of this tick is in before a verb aims).
export function mountHollowVerbs(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountHollowVerbs: already mounted');
  mounted = true;
  const offOps = onOpsChange((change) => {
    if (change.type !== 'start') return;
    const telegraph = store.getState().hollow.verb;
    if (telegraph === null) return;
    const { operation } = change;
    if (operation.segId === telegraph.targetId || operation.targetIds.includes(telegraph.targetId)) touched = true;
  });
  const offTick = onAiTick((dtAi) => tick(store, dtAi));
  // A ship that is over (lost, or printed) takes a countdown with it, and its warning.
  const offOver = onPostTick(() => {
    const state = store.getState();
    if (state.hollow.verb === null || isLivePhase(state)) return;
    endTelegraph(store, null);
  });
  const offReset = onWorldReset('hollow-verbs', resetVerbs, () => ({ touched, rolled: verbRng !== null }));
  return () => {
    offOps();
    offTick();
    offOver();
    offReset();
    resetVerbs();
    mounted = false;
  };
}
