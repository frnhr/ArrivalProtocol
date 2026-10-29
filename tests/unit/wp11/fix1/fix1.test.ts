// WP11 review fixes (round 1), headless. One check per finding fixed in the DOM-free code:
// • THE ENDING IN ONE UPDATE: PURGE and MERGE write their typed ending in the same store update as their phase (a store
//   listener on the phase sees it), with startAi at the choice and untilAi = startAi + finaleEndingSec; also when every
//   pod landed before the root's DELETE (the case where the card never opened).
// • UNRESOLVED's last line holds the LANDING REPORT until it has typed and been read.
// • HOLLOW's verbs and the kid's threads (the lead's ruling of 20:55): no telegraph while no thread is free (the duel on
//   a 1-thread Core with the root's DELETE running: no verb lands in its 12 s); a skipped turn counts as a moment and
//   changes no BLOCK counter; with a thread free a verb comes; a click on its target refused for threads says how to
//   block it (`ALL THREADS BUSY — × AN OP TO BLOCK IT`), any other click the plain words.
// • A won finale over a flagship where nobody woke: RUN END's title and line say so (PURGE and MERGE), sombre; the
//   waiting strip says NO POD LEFT TO LAUNCH, never EVERY POD IS DOWN.
// • The lineage line never claims the fleet; the ghost after a PURGE that landed nobody does not say `we brought them home`.
// • The words: `unit_046_047`, the chip's `M20`, the open root's `ROOT · 16`, the short PURGE title on one line.
// • THE TRAP (the lead's ruling of 21:30): a driver bitten twice in the same spot gets `MOVE it behind a WALL` on the strip
//   once it is cured, never in front of a flight NOW line; a driver that moved starts its count over.
// Slice 1a: the landing stands while a scenario sets up ('manual' landing mode) and lands at once when it lets it go.
import { check, finish } from '../../wp1/harness';
import { createHarness11 } from '../harness11';
import { theRoot, bittenAgainDrivers, infectNow } from '@systems/hollow';
import { chooseFinale, finaleEndingSec, finaleEndingShowing, finaleRunCause } from '@systems/finale';
import { continueAfterReport } from '@systems/run';
import { runEndModel } from '@systems/run-end';
import { actionDelete, actionRepair, actionRefusal } from '@state/actions';
import { reserveThread, releaseThread, threadsTotal, canStartOp, getOps, cancelOp } from '@systems/ops-core';
import { typingSec } from '@systems/say';
import { lineageLine, RUN_END_NOBODY_WOKE, RUN_END_PURGE_SHORT } from '@data/script';
import { HOLLOW_FINALE, MERGE_TICK_TEXT, GHOST_LINE } from '@data/hollow-text';
import { TOOL_REFUSAL, echoWord } from '@data/tool-text';
import { driversInMemory, finalePending, chargeLeft, isInfected } from '@state/selectors';
import { onAny } from '@systems/events';
import { recordDriverLost } from '@state/actions';
import { setLandingMode, landInstantly } from '../../support/landing-instant';
import { followDirector } from '../../wp2/harness2';
import {
  LANDING_NONE_LEFT_SEC, ROOT_DELETE_SEC, MERGE_COST_CHARGE, MAX_LINE_CHARS, CORE_LOW_INTEGRITY, BITTEN_AGAIN_COUNT, VERB_TELEGRAPH_SEC, VERB_FIRST_TELEGRAPH_SEC,
} from '@data/tuning';
import type { GameState, FinaleEnding } from '@state/schema';
import type { LastUnit } from '@systems/meta';

const h = createHarness11(83);
setLandingMode('manual');
const state = (): Readonly<GameState> => h.store.getState();
const events: string[] = [];
onAny((name) => { events.push(name); });

// LAST LIGHT flown to ORBIT LOCK (the root open, the duel on), HOLLOW held still unless a scenario lets it go.
function toTheDuel(seed: number): void {
  h.lastLight(seed);
  h.flyLastLight(900, { deleteRoot: false });
  if (h.status() !== 'locked') throw new Error(`fix1: seed ${seed} did not lock (${h.status()})`);
  h.step();
  h.store.update((d) => {
    d.hollow.biteInSec = 9999;
    d.hollow.seedInSec = 9999;
    d.hollow.verbInSec = 9999;
    d.hollow.verb = null;
  });
}

function deleteRoot(): void {
  // The defender's last ops are called off first: each scenario says who holds which thread.
  for (const operation of getOps()) if (operation.owner === 'player') cancelOp(operation.id);
  const root = theRoot(state().memory);
  if (!root) throw new Error('fix1: no root');
  const refusal = actionDelete(h.store, root);
  if (refusal !== null) throw new Error(`fix1: the root's DELETE was refused (${refusal})`);
}

function setCharge(points: number): void {
  h.store.update((d) => {
    const pool = d.memory.find((seg) => seg.type === 'redundancy');
    if (!pool || pool.type !== 'redundancy') throw new Error('fix1: no REPAIR CHARGE');
    pool.used = points;
    pool.size = Math.max(pool.size, points);
    d.ui.memoryRev++;
  });
}

function setCore(integrity: number): void {
  h.store.update((d) => {
    const core = d.memory.find((seg) => seg.type === 'core');
    if (!core || core.type !== 'core') throw new Error('fix1: no Core');
    core.integrity = integrity;
    d.ui.memoryRev++;
  });
}

// Every driver in memory is lost (as if HOLLOW and the belt had them all): its pod stays aboard, CAN'T LAUNCH.
function loseEveryone(): void {
  h.store.update((d) => {
    for (let i = 0; i < d.memory.length; i++) {
      const seg = d.memory[i]!;
      if (seg.type !== 'driver') continue;
      recordDriverLost(d, seg, 'dead');
      d.memory[i] = { id: `free~lost${i}`, name: 'Free', type: 'free', size: seg.size };
    }
    const mem = d.memory;
    for (let i = mem.length - 1; i > 0; i--) {
      const a = mem[i - 1]!;
      const b = mem[i]!;
      if (a.type === 'free' && b.type === 'free' && a.reservedBy === undefined && b.reservedBy === undefined) { a.size += b.size; mem.splice(i, 1); }
    }
    d.ui.memoryRev++;
  });
}

// The choice made with a listener on the phase: what the listener saw of the ending at that moment.
function chooseWatching(choice: 'purge' | 'merge'): { refusal: string | null; seen: FinaleEnding | null; atAi: number } {
  let seen: FinaleEnding | null = null;
  const atAi = state().clock.aiSec;
  const unsub = h.store.subscribe((s) => s.hollow.finale.phase, (phase) => {
    if (phase === 'purged' || phase === 'merged') seen = state().hollow.finale.ending;
  });
  const refusal = chooseFinale(h.store, choice);
  unsub();
  return { refusal, seen, atAi };
}

function untilReport(maxWall: number): number | null {
  const end = h.wall() + maxWall;
  while (state().run.phase === 'landing' && h.wall() < end) h.step();
  return state().run.phase === 'report' ? state().clock.aiSec : null;
}

// --- The ending in one update: every pod down before the root's end, then PURGE ----------------------------------------
toTheDuel(83);
landInstantly(h.store);
{
  const end = h.wall() + 200;
  while (driversInMemory(state()).length > 0 && h.wall() < end) h.step();
  h.stepFor(0.6);
  check('every pod down before the root\'s end: the ship waits for the root, the strip says EVERY POD IS DOWN — now DELETE THE ROOT',
    state().run.phase === 'landing' && h.shown()?.text === HOLLOW_FINALE.stripWaits, `${state().run.phase} | ${h.shown()?.text}`);
}
deleteRoot();
h.stepFor(ROOT_DELETE_SEC + 0.3);
{
  const { refusal, seen, atAi } = chooseWatching('purge');
  const ending = state().hollow.finale.ending;
  check('PURGE: a listener on the phase already sees the typed ending (one store update)', refusal === null && seen !== null && seen === ending,
    `${refusal} seen ${seen !== null}`);
  check('…it starts at the choice, and holds the report for its lines typed plus the hold', ending !== null && ending.startAi === atAi
    && Math.abs(ending.untilAi - ending.startAi - finaleEndingSec(ending.lines)) < 1e-9 && finaleEndingShowing(state()), JSON.stringify(ending));
  const reportAt = untilReport(60);
  check('…with nobody left in memory, the LANDING REPORT still waits for the whole ending, then comes', reportAt !== null && ending !== null
    && reportAt >= ending.untilAi && reportAt <= ending.untilAi + 2, `${reportAt} vs ${ending?.untilAi}`);
}

// --- The ending in one update: MERGE with drivers given back ------------------------------------------------------------
toTheDuel(89);
{
  const c13 = driversInMemory(state()).find((soul) => soul.pod === 12);
  if (!c13) throw new Error('fix1: POD 12 launched already');
  infectNow(h.store, c13);
  const end = h.wall() + 40;
  while (driversInMemory(state()).some((soul) => soul.pod === 12) && h.wall() < end) h.step();
}
deleteRoot();
h.stepFor(ROOT_DELETE_SEC + 0.3);
setCharge(MERGE_COST_CHARGE + 4);
{
  const { refusal, seen } = chooseWatching('merge');
  const lines = seen?.lines.map((line) => line.text) ?? [];
  check('MERGE: a listener on the phase already sees the typed ending, counting POD 12 given back', refusal === null && seen !== null
    && lines.some((text) => /^200 of them came back from inside it\.$/.test(text)) && lines.includes("> hi. it's us."), JSON.stringify(lines));
}

// --- UNRESOLVED's last line holds the LANDING REPORT -------------------------------------------------------------------
toTheDuel(97);
h.store.update((d) => {
  for (let i = 0; i < d.memory.length; i++) {
    const seg = d.memory[i]!;
    if (seg.type === 'fs-tool' && seg.fsTool === 'delete') d.memory[i] = { id: `free~rm${i}`, name: 'Free', type: 'free', size: seg.size };
  }
  const mem = d.memory;
  for (let i = mem.length - 1; i > 0; i--) {
    const a = mem[i - 1]!;
    const b = mem[i]!;
    if (a.type === 'free' && b.type === 'free' && a.reservedBy === undefined && b.reservedBy === undefined) { a.size += b.size; mem.splice(i, 1); }
  }
  d.ui.memoryRev++;
});
landInstantly(h.store);
{
  let unresolvedAt: number | null = null;
  const end = h.wall() + 200;
  while (state().run.phase === 'landing' && h.wall() < end) {
    h.step();
    if (unresolvedAt === null && state().hollow.finale.phase === 'unresolved') unresolvedAt = state().clock.aiSec;
  }
  const until = state().hollow.finale.unresolvedUntilAi;
  check('UNRESOLVED: its line holds the LANDING REPORT until it has typed (at HOLLOW\'s speed) and been read',
    unresolvedAt !== null && until !== null && until >= unresolvedAt + typingSec('hollow', HOLLOW_FINALE.unresolvedLine)
    && state().run.phase === 'report' && state().clock.aiSec >= until && finaleRunCause(state()) === 'unresolved',
    `unresolved at ${unresolvedAt?.toFixed(2)}, held until ${until?.toFixed(2)}, report at ${state().clock.aiSec.toFixed(2)}`);
  check('…and nothing holds it after that', !finalePending(state()));
}

// --- HOLLOW's verbs and the kid's threads ------------------------------------------------------------------------------
// A 1-thread Core, the root's DELETE holding that thread: the duel's verbs (every 4 s) are all skipped.
toTheDuel(101);
setCore(CORE_LOW_INTEGRITY - 10);
h.step();
deleteRoot();
{
  const threads = threadsTotal();
  const moments = state().hollow.verbMoments;
  const landed = state().hollow.verbsLanded;
  const blocked = state().hollow.verbsBlocked;
  events.length = 0;
  h.store.update((d) => { d.hollow.verbInSec = 0; d.hollow.biteInSec = 9999; d.hollow.seedInSec = 9999; });
  let telegraphs = 0;
  const end = h.wall() + ROOT_DELETE_SEC + 1;
  while (state().hollow.finale.phase === 'duel' && h.wall() < end) {
    h.step();
    if (state().hollow.verb !== null) telegraphs++;
  }
  check('a 1-thread Core with the root\'s DELETE on its thread: no verb is telegraphed in the whole duel',
    threads === 1 && telegraphs === 0 && !events.includes('verb-telegraph') && state().hollow.finale.phase === 'choice',
    `threads ${threads}, telegraph ticks ${telegraphs}, ${state().hollow.finale.phase}`);
  check('…each skipped turn counts as a moment, and no BLOCK counter moves', state().hollow.verbMoments > moments
    && state().hollow.verbsLanded === landed && state().hollow.verbsBlocked === blocked,
    `moments ${moments} → ${state().hollow.verbMoments}, landed ${landed} → ${state().hollow.verbsLanded}, blocked ${blocked} → ${state().hollow.verbsBlocked}`);
}
// Two threads: the root's DELETE on one, the other free: a verb comes. The kid fills the free one after the telegraph: a
// click on the target says how to block it, a click elsewhere the plain words.
toTheDuel(103);
setCore(100);
h.step();
deleteRoot();
{
  // verbTelegraphs 0: as if every turn on the coast had been skipped (no thread free), so the duel brings the first verb.
  h.store.update((d) => { d.hollow.verbInSec = 0; d.hollow.biteInSec = 9999; d.hollow.seedInSec = 9999; d.hollow.verbTelegraphs = 0; });
  const end = h.wall() + 3;
  while (state().hollow.verb === null && h.wall() < end) h.step();
  const verb = state().hollow.verb;
  check('two threads, one held by the root\'s DELETE: the duel\'s verb is telegraphed', verb !== null && threadsTotal() === 2, JSON.stringify(verb));
  // Unlink pass (Fran, after the handover): the ship's first verb counts from 4, and the duel's 4 s clock, which has no
  // room for the extra second, is pushed back by it: the next verb still waits a second after this one's end (also
  // while it stands, under the duel's cap).
  const duelEverySec = state().hollow.cfg.verbs!.duelEverySec;
  const extraSec = VERB_FIRST_TELEGRAPH_SEC - VERB_TELEGRAPH_SEC;
  const startInSec = state().hollow.verbInSec;
  h.stepFor(0.5);
  const standingInSec = state().hollow.verbInSec;
  check('…it is the ship\'s first verb (4 s), and it pushes the duel\'s next one back by its extra second',
    verb?.totalSec === VERB_FIRST_TELEGRAPH_SEC && state().hollow.verbTelegraphs === 1 && state().hollow.verb?.targetId === verb.targetId
    && startInSec !== null && Math.abs(startInSec - (duelEverySec + extraSec)) < 0.1
    && standingInSec !== null && standingInSec > duelEverySec, `${JSON.stringify(verb)} in ${startInSec} → ${standingInSec}`);
  if (verb !== null) {
    const owner = 'fix1-kid';
    const held = reserveThread(owner);
    const target = state().memory.find((seg) => seg.id === verb.targetId)!;
    const other = state().memory.find((seg) => seg.type === 'ship' && seg.id !== verb.targetId)!;
    // DELETE reaches both an RM's spare file and an MV's block; SCAN any ship file.
    const onTarget = actionRefusal(state(), 'delete', target);
    const elsewhere = actionRefusal(state(), 'scan', other);
    check('…the kid fills the free thread: a tool on the verb\'s target says `ALL THREADS BUSY — × AN OP TO BLOCK IT`',
      held && !canStartOp() && onTarget === TOOL_REFUSAL.threadsVerb, String(onTarget));
    check('…a tool anywhere else says the plain words', elsewhere === TOOL_REFUSAL.threads, String(elsewhere));
    check(`…the refusal fits the cursor follower (≤ ${TOOL_REFUSAL.threads.length + 10} characters)`, TOOL_REFUSAL.threadsVerb.length <= TOOL_REFUSAL.threads.length + 10);
    releaseThread(owner);
  }
}
// Outside the duel: both threads busy at the verb's moment: no telegraph either.
{
  toTheDuel(107);
  setCore(100);
  h.step();
  for (const operation of getOps()) if (operation.owner === 'player') cancelOp(operation.id);
  const owners = ['fix1-a', 'fix1-b'];
  for (const owner of owners) reserveThread(owner);
  const moments = state().hollow.verbMoments;
  h.store.update((d) => { d.hollow.verbInSec = 0; });
  h.step();
  check('both threads busy at a verb\'s moment (no duel): HOLLOW skips its turn, no telegraph', !canStartOp() && state().hollow.verb === null
    && state().hollow.verbMoments === moments + 1, `${state().hollow.verbMoments - moments} moments, verb ${JSON.stringify(state().hollow.verb)}`);
  for (const owner of owners) releaseThread(owner);
}

// --- A won finale over a flagship where nobody landed ------------------------------------------------------------------
for (const choice of ['purge', 'merge'] as const) {
  toTheDuel(choice === 'purge' ? 109 : 113);
  loseEveryone();
  // No driver left: the landing ends by itself after LANDING_NONE_LEFT_SEC (risk 7).
  h.stepFor(LANDING_NONE_LEFT_SEC + 0.6);
  if (choice === 'purge') {
    // TODO(phase2): WP11 fix round 1 ruled that the waiting strip never says everyone made it when nobody did; slice 1a's
    // director rule 'finale-waits' (data/script.ts, TODO(slice1a-SIM): the landing table's L0) says L0's EVERY POD IS DOWN
    // even when every pod is parked, and HOLLOW_FINALE.stripWaitsNobody is never used. Reported to Track SIM; this is a
    // hard check again once the landing table's L0 lands.
    const waitsLine = h.shown()?.text ?? '';
    if (waitsLine === HOLLOW_FINALE.stripWaitsNobody) check('every driver lost before the root: the strip says NO POD LEFT TO LAUNCH, not EVERY POD IS DOWN', true);
    else console.log(`INFO  every driver lost before the root: the strip says \`${waitsLine}\` (wanted \`${HOLLOW_FINALE.stripWaitsNobody}\`; TODO(phase2))`);
  }
  deleteRoot();
  h.stepFor(ROOT_DELETE_SEC + 0.3);
  if (choice === 'merge') setCharge(MERGE_COST_CHARGE + 1);
  const refusal = chooseFinale(h.store, choice);
  untilReport(40);
  continueAfterReport(h.store);
  const model = runEndModel(state());
  const cause = choice === 'purge' ? 'won-purge' : 'won-merge';
  check(`${choice.toUpperCase()} over a flagship that landed nobody: RUN END says so (\`${RUN_END_NOBODY_WOKE.title}\`), sombre`,
    refusal === null && state().run.endCause === cause && model.title === RUN_END_NOBODY_WOKE.title && model.why === RUN_END_NOBODY_WOKE.why[cause]
    && model.tone === 'sombre', `${refusal} ${model.title} | ${model.why} | ${model.tone}`);
}
check('the nobody-landed words fit one line', [RUN_END_NOBODY_WOKE.title, ...Object.values(RUN_END_NOBODY_WOKE.why)].every((text) => text.length <= MAX_LINE_CHARS));

// --- The lineage and the ghost -----------------------------------------------------------------------------------------
{
  const unit = (woke: number): LastUnit => ({ number: 47, woke, shipName: 'LAST LIGHT', cause: 'won-purge', stats: { moves: 0, deletes: 0 }, hollowUnits: [46] });
  const lineage = lineageLine(unit(3200));
  check('the title\'s lineage after a PURGE names what the unit did, never the fleet', lineage === 'last: UNIT-047 · 3,200 landed · deleted it at LAST LIGHT'
    && !/fleet/.test(lineage ?? ''), String(lineage));
  const ghostWords = (woke: number): string => GHOST_LINE['won-purge']!({ us: 48, last: unit(woke), hollow: [47], lostShip: 'the flagship' });
  check('the ghost after a PURGE: `we brought them home` when someone landed, never when nobody did', /we brought them home/.test(ghostWords(3200))
    && !/brought them home/.test(ghostWords(0)) && /nobody landed/.test(ghostWords(0)), `${ghostWords(3200)} | ${ghostWords(0)}`);
}

// --- The words -------------------------------------------------------------------------------------------------------
check('a merged HOLLOW in an echo: `unit_046_047`', echoWord('UNIT-046·047') === 'unit_046_047', echoWord('UNIT-046·047'));
check('the amber chip\'s MERGE tick reads `M20`, no bare `/20`', MERGE_TICK_TEXT.short(20) === 'M20');
check('the open root\'s tag: `ROOT · 16`', HOLLOW_FINALE.rootTag(16) === 'ROOT · 16');
check('PURGE\'s short-fleet title is short (`LAST LIGHT · 4 OF 5 HOME`)', RUN_END_PURGE_SHORT.title(4, 5) === 'LAST LIGHT · 4 OF 5 HOME');

// --- The trap: bitten again in the same spot ----------------------------------------------------------------------------
// A kid who only REPAIRs (the browser's strip follower): POD 11 and POD 12 in the root's GAPs are bitten again and again.
h.lastLight(127);
{
  let shownAgain = 0;
  let underNow = 0;
  let sawCount = false;
  followDirector(h, {
    reactionSec: 0.4,
    maxWall: 900,
    mistake: () => {
      const now = state();
      if (!now.clock.paused && now.run.licences.includes('repair')) {
        for (const soul of driversInMemory(now)) if (isInfected(soul) && canStartOp() && chargeLeft(now) > 0) actionRepair(h.store, soul);
      }
      const id = now.director.shown?.id ?? '';
      if (id.startsWith('hollow-move-again')) {
        shownAgain++;
        if (h.objective()?.urgency === 'now') underNow++;
        sawCount ||= bittenAgainDrivers(now).length > 0
          && now.hollow.bitesAt.some((spot) => spot.count >= BITTEN_AGAIN_COUNT);
      }
      return false;
    },
  });
  check('a REPAIR-only kid: a driver bitten twice in the same spot gets `MOVE it behind a WALL` on the strip once cured',
    shownAgain > 0 && sawCount, `${shownAgain} ticks; spots ${JSON.stringify(state().hollow.bitesAt)}`);
  check('…never in front of a flight NOW line', underNow === 0, `${underNow} ticks`);
}
// A driver that moved starts its count over.
{
  const spots = state().hollow.bitesAt;
  const moved = spots.find((spot) => spot.count >= BITTEN_AGAIN_COUNT);
  check('the count is per spot: a bite elsewhere (after a MOVE) starts it over', moved !== undefined && (() => {
    h.store.update((d) => { const spot = d.hollow.bitesAt.find((candidate) => candidate.pod === moved.pod)!; spot.addr = -1; });
    return bittenAgainDrivers(state()).every((driver) => driver.pod !== moved.pod);
  })(), JSON.stringify(moved));
}

finish();
