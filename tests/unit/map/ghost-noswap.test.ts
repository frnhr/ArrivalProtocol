// Slice 3b review (item 1): VESPER on the arm with no Swap aboard (run 1's worked route asks for Swap at KESTREL, 4 years
// late). Built directly: run 1 on the arm, the first three ships passed desk to desk with the repository fixture's sends
// (Mv only: no Rm, no Swap), then VESPER flown by the real systems. On the way, KESTREL's no-rm line (review M2).
// • the ship's first burst still stops a SKIP (the alarm moment);
// • the strip shows `NO SWAP ABOARD — …` right after the alarm, and keeps it while it is new (it used to be live only
//   while a burst ran, a third of a second at CRUISE, and never won the strip);
// • from then on a SKIP is refused (`ENGINE FAULT — NO SKIP`) and no burst is flown through in a SKIP;
// • a Swap aboard lifts both (the WP10 rules again: the lesson, and a SKIP flies through later bursts).
import { check, finish } from '../landing/checks';
import { createHarness11 } from '../wp11/harness11';
import { startRun } from '@systems/run';
import { receiveTransmission } from '@systems/boot';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { skipBlockReason, SKIP_REFUSAL_ENGINE_FAULT } from '@systems/pace';
import { currentPrediction } from '@systems/predict';
import { noSwapForGhost } from '@systems/repository';
import { installTool } from '@systems/licences';
import { on } from '@systems/events';
import { seedsInMemory } from '@systems/hollow';
import { REPO_TEXT } from '@data/repo-text';
import { MAX_LINE_CHARS } from '@data/tuning';
import { send, giveTools } from './repo-fixture';
import type { GameState } from '@state/schema';

const h = createHarness11(1, { soulsFound: false });
const st = (): Readonly<GameState> => h.store.getState();
h.newRun(3);
startRun(h.store, 3, FIRST_RUN_LINEAGE, 'arm');
receiveTransmission(h.store);
h.stepUntil(() => st().run.phase === 'flight', 15);
const asks = ['mv', null] as const;
[2, 5].forEach((slot, i) => {
  h.store.update((draft) => { draft.run.phase = 'report'; });
  send(h.store, slot, asks[i]);
});
h.stepUntil(() => st().run.phase === 'flight', 25);
// Review M2 on the way: KESTREL's seed on the beam with no rm aboard (none was asked for) says where rm comes from.
let noRmShown = false;
const kestrelEnd = h.wall() + 60;
while (h.wall() < kestrelEnd && !noRmShown) { h.defend11(); h.step(); noRmShown = st().director.shown?.id === 'tut-no-rm'; }
check('KESTREL with a seed aboard and no rm: `NO RM ABOARD — ask the REPOSITORY [R] at the next desk` (review M2)',
  st().level.shipName === 'KESTREL' && noRmShown && st().director.shown?.text === REPO_TEXT.noRm, st().director.shown?.text ?? 'none');
h.store.update((draft) => { draft.run.phase = 'report'; });
send(h.store, 11);
h.stepUntil(() => st().run.phase === 'flight', 25);
// An rm for the defender (the seeds' own SKIP refusals are not this suite's).
giveTools(h.store, ['delete']);
check('VESPER on the arm, ENGINE FAULT, no Swap aboard (the controller fires by itself)',
  st().level.shipName === 'VESPER' && st().run.map.world === 'arm' && !st().memory.some((seg) => seg.type === 'fs-tool' && seg.fsTool === 'swap'));

let burstsInSkip = 0;
on('ghost-start', () => { if (st().clock.skipWarp !== null && st().burn.ghostBursts > 1) burstsInSkip++; });

h.press('KeyF');
const skipped = st().clock.skipWarp !== null;
h.stepUntil(() => st().burn.ghostBursts > 0, 120);
check('a SKIP still lands on the ship\'s first burst (its alarm moment)', skipped && st().burn.ghostBursts === 1 && st().clock.skipWarp === null);
h.stepUntil(() => !st().alerts.list.some((alert) => alert.severity === 'alarm'), 20);
let shownNoSwap = false;
const until = h.wall() + 3;
while (h.wall() < until) { h.step(); if (st().director.shown?.id === 'tut-ghost-noswap') shownNoSwap = true; }
check('right after the alarm the strip shows the no-Swap line (review: it never won the strip)', shownNoSwap, st().director.shown?.text ?? 'none');
check('…its words say what to do, in one strip row', REPO_TEXT.noSwap.length <= MAX_LINE_CHARS && /Fix ▼/.test(REPO_TEXT.noSwap));
h.stepUntil(() => st().burn.ghost === null, 5);
check('…and the moment stands between bursts', st().burn.ghost === null && noSwapForGhost(st()));

// The seed on the beam holds its own SKIP refusal: the defender (who has Rm) clears it first.
// (and an infection the KESTREL seed left is healed: their alerts hold SKIP refusals of their own).
const seedGone = h.wall() + 90;
while (h.wall() < seedGone && (seedsInMemory(st().memory).length > 0 || skipBlockReason(st(), currentPrediction()) !== SKIP_REFUSAL_ENGINE_FAULT)) {
  h.defend11();
  h.step();
}
check('from the first burst on, a SKIP is refused: `ENGINE FAULT — NO SKIP`',
  skipBlockReason(st(), currentPrediction()) === SKIP_REFUSAL_ENGINE_FAULT, skipBlockReason(st(), currentPrediction()) ?? 'allowed');
const before = st().burn.ghostBursts;
const end = h.wall() + 40;
while (h.wall() < end && st().burn.status === 'approaching') {
  h.defend11();
  if (/^WAIT/.test(st().director.shown?.text ?? '')) h.press('KeyF');
  h.step();
}
check('…40 wall seconds pressing F under every WAIT: bursts fired, none inside a SKIP', st().burn.ghostBursts > before && burstsInSkip === 0,
  `${st().burn.ghostBursts - before} bursts, ${burstsInSkip} in a SKIP`);
check('…the WAIT line offers no [F] SKIP meanwhile', !(st().director.shown?.text ?? '').includes('[F] SKIP'), st().director.shown?.text ?? '');

installTool(h.store, 'swap');
check('a Swap aboard: no no-Swap moment, and the SKIP is no longer refused for the engine',
  !noSwapForGhost(st()) && skipBlockReason(st(), currentPrediction()) !== SKIP_REFUSAL_ENGINE_FAULT, skipBlockReason(st(), currentPrediction()) ?? 'allowed');
finish();
