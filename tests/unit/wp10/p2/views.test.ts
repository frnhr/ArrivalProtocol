// WP10 part 2: what VESPER shows and says, as data (the DOM-free models the views paint), headless on harness10.
// Phase 3 slice 2 (slice-2-plan §5.3, Track UI): THE DEAL left VESPER and folds into LAST LIGHT when the run reaches it
// without one, and VESPER's boot line (keepCharge) moved to its landing (risk 6): the deal's views and the boot's closing
// HOLLOW line are checked on LAST LIGHT (its `> last ship, 047. i'm so tired.`). The ghost and SWAP stay on VESPER.
// • the engine firing by itself: the NAV PLOT's STATUS reads UNCOMMANDED during a burst (COASTING after it); the
//   THRUST CTRL pip carries the count (`FIRED ×n`, from the first burst, gone once the controller is swapped); in blue
//   the mode toggle names the counter (`◀ SHIP · UNCOMMANDED THRUST ×n`) while nothing more urgent stands;
// • SWAP: the pair after a swap reads as what each now is (INSPECT's type line and text); the swap op's bar spans
//   both files;
// • THE DEAL: its choice carries keys ([Y] ACCEPT, [N] REFUSE) and ticker words; the ticker holds it on the amber
//   screen for as long as it stands, read or not (`WANTS A DEAL · [TAB] 0:12`), urgent in its last CHOICE_URGENT_SEC;
//   its clock is whole seconds of the timer; sayChoice refuses a look that does not fit its options;
// • NEXT BITE after the answer: FED while an ACCEPT keeps it still (counting the pause in: monotonic, no jump when
//   the pause ends), FASTER while a REFUSE hastes it; the answer's stamps fit and never say HOLLOW;
// • the final ship's boot ends with HOLLOW's own line in its pink (`> last ship, 047. i'm so tired.`); the cut to amber
//   waits until it has typed; a skip jumps to it (it is said at once) and the cut still waits.
import { check, finish } from '../../wp1/harness';
import { createHarness10, VESPER } from '../harness10';
import { windowPip, plotReadouts, toggleAlert, choiceTicker } from '@systems/flight-hud';
import { tickerEntry, sayChoice, openChoiceEntry, choiceTimerRunning, choiceSecondsLeft, typingSec, withdrawChoice } from '@systems/say';
import { biteClock } from '@systems/hollow-hud';
import { DEAL_ACCEPT, DEAL_REFUSE } from '@systems/hollow-deal';
import { pickChoice } from '@systems/say';
import { getPrediction } from '@systems/predict';
import { setMode } from '@systems/mode';
import { skipBoot } from '@systems/boot';
import { resetWorld } from '@systems/reset';
import { getOps } from '@systems/ops-core';
import { getByRole } from '@state/selectors';
import { GHOST_WARN_ID, GHOST_ALARM_ID } from '@systems/alerts';
import { bootLinePlan, bootLine, bootLineSpeaker, lineVars } from '@data/script';
import { GHOST_TEXT } from '@data/ghost-text';
import { HOLLOW_DEAL, HOLLOW_HUD_TEXT, HOLLOW_STORY } from '@data/hollow-text';
import { SWAP_DESC } from '@data/tool-text';
import { segTypeLabel } from '@data/type-labels';
import {
  CHOICE_URGENT_SEC, DEAL_TIMEOUT_SEC, DEAL_PAUSE_SEC, MAX_LINE_CHARS, BOOT_AFTER_HOLLOW_LINE_SEC,
} from '@data/tuning';

const h = createHarness10(3);
const state = () => h.store.getState();
const LAST_LIGHT = 4;
// LAST LIGHT alone, in flight, a fresh unit carried in: the run reaches it without a deal, so THE DEAL folds in (slice 2).
const lastLight = (seed: number): void => {
  h.shipAlone(LAST_LIGHT, seed);
  h.events.length = 0;
};


// --- The engine firing by itself, on screen ------------------------------------------------------------------------
{
  h.vesper(41, { hollowAsleep: true });
  check('VESPER before any burst: the THRUST CTRL pip counts nothing, STATUS COASTING',
    windowPip(state(), 'thrust-ctrl').count === '' && plotReadouts(state(), getPrediction()).status.text === 'COASTING');
  let statusDuring = '';
  let toneDuring = '';
  h.stepUntil(() => {
    if (state().burn.ghost !== null) {
      const status = plotReadouts(state(), getPrediction()).status;
      statusDuring = status.text;
      toneDuring = status.tone;
    }
    return state().burn.ghostBursts >= 1 && state().burn.ghost === null;
  }, 120);
  check('during a burst the NAV PLOT STATUS reads UNCOMMANDED in the warning tone, COASTING after it',
    statusDuring === GHOST_TEXT.status && toneDuring === 'danger' && plotReadouts(state(), getPrediction()).status.text === 'COASTING',
    `${statusDuring}/${toneDuring}`);
  // The first burst's alarm still stands (≥ GHOST_ALARM_MIN_SEC): in blue the toggle names it, not a countdown.
  setMode(h.store, 'memory');
  const alarmToggle = state().alerts.list.some((alert) => alert.id === GHOST_ALARM_ID) ? toggleAlert(state(), getPrediction()) : null;
  setMode(h.store, 'tools');
  check('in blue during the first burst\'s alarm the mode toggle reads ◀ SHIP · UNCOMMANDED THRUST (an alarm)',
    alarmToggle?.body === GHOST_TEXT.alarm && alarmToggle.severity === 'alarm', JSON.stringify(alarmToggle));
  const pip = windowPip(state(), 'thrust-ctrl');
  check('the THRUST CTRL pip carries the count from the first burst (`FIRED ×1`, still a `?`: not scanned)',
    pip.count === GHOST_TEXT.pipCount(1) && pip.look === 'unknown' && pip.title.includes(GHOST_TEXT.pipTitle(1)), JSON.stringify(pip));
  check('…and no other pip does', windowPip(state(), 'reactor').count === '' && windowPip(state(), 'engine-io').count === '');
  h.stepUntil(() => state().burn.ghostBursts >= 3 && state().alerts.list.some((alert) => alert.id === GHOST_WARN_ID), 200);
  check('…and keeps counting (`FIRED ×3`)', windowPip(state(), 'thrust-ctrl').count === GHOST_TEXT.pipCount(state().burn.ghostBursts),
    windowPip(state(), 'thrust-ctrl').count);
  // In blue, the toggle names the counter (nothing more urgent on the ship: VESPER coasts, its burn minutes away).
  setMode(h.store, 'memory');
  const toggle = toggleAlert(state(), getPrediction());
  check('in blue the mode toggle names it: ◀ SHIP · UNCOMMANDED THRUST ×n (a warning)',
    toggle?.screen === 'tools' && toggle.body === GHOST_TEXT.counter(state().burn.ghostBursts) && toggle.severity === 'warn',
    JSON.stringify(toggle));
  setMode(h.store, 'tools');
  // SWAP: the count goes with the ghost.
  check('the pip → SWAP defender swaps', h.pipSwap());
  check('…one bar across both files (spanTargets, both files touched)', getOps().some((operation) => operation.kind === 'swap'
    && operation.view.spanTargets && operation.targetIds.length === 2));
  h.stepFor(2.5);
  check('after the SWAP the pip counts nothing and the toggle is quiet', windowPip(state(), 'thrust-ctrl').count === ''
    && (setMode(h.store, 'memory'), toggleAlert(state(), getPrediction())) === null);
  setMode(h.store, 'tools');
  const taking = getByRole(state(), 'thrust-ctrl');
  const old = state().memory.find((seg) => seg.type === 'ship' && seg.state === 'inactive' && seg.role === undefined);
  check('…the pair reads as what each now is: the backup in use, the old one switched off (INSPECT\'s type and text)',
    taking?.type === 'ship-backup' && segTypeLabel(taking) === 'Ship System · Backup, in use' && taking.desc === SWAP_DESC.taking
    && old !== undefined && segTypeLabel(old) === 'Ship System · Switched off' && old.desc === SWAP_DESC.old,
    `${taking?.name}: ${taking ? segTypeLabel(taking) : '-'} / ${old?.name}: ${old ? segTypeLabel(old) : '-'}`);
}

// --- THE DEAL: the choice, the ticker, the clock --------------------------------------------------------------------
{
  lastLight(5);
  check('LAST LIGHT (reached with no deal this run) folds THE DEAL in', state().hollow.cfg.deal && state().run.stats.deal === null);
  h.stepUntil(() => state().hollow.phase === 'awake', 60);
  h.stepUntil(() => state().hollow.deal.phase === 'offered', 30);
  const entry = openChoiceEntry(state());
  check('the deal is a choice with keys [Y] ACCEPT / [N] REFUSE and ticker words', entry !== null
    && entry.choice?.options.join() === [DEAL_ACCEPT, DEAL_REFUSE].join() && entry.choice.keys?.join() === `${HOLLOW_DEAL.acceptKey},${HOLLOW_DEAL.refuseKey}`
    && entry.choice.tickerWords === HOLLOW_DEAL.tickerWords, JSON.stringify(entry?.choice));
  // Flying in amber while it stands: the ticker holds it, with its words, the way there and its clock.
  setMode(h.store, 'tools');
  const ticker = tickerEntry(state());
  const shown = ticker ? choiceTicker(state(), ticker) : null;
  // WP10 review fix: no clock while the line still types (its timer has not started): `0:15` standing still for ~10 s
  // read as a broken countdown.
  check('in amber the ticker holds the choice: `WANTS A DEAL · [TAB]`, no clock before its timer runs', ticker?.id === entry?.id
    && shown?.text === `${HOLLOW_DEAL.tickerWords} · [TAB]` && !shown.urgent, shown?.text ?? 'none');
  check('…its timer has not started while the line is still typing', !choiceTimerRunning(state(), entry!));
  h.stepUntil(() => choiceTimerRunning(state(), openChoiceEntry(state())!), 15);
  h.stepFor(3.2);
  const running = openChoiceEntry(state())!;
  check('…then it counts whole seconds of the timer (`0:12` after 3.2 s)', choiceSecondsLeft(running.choice!) === DEAL_TIMEOUT_SEC - 3
    && choiceTicker(state(), running)?.text.endsWith(`0:${DEAL_TIMEOUT_SEC - 3}`) === true, choiceTicker(state(), running)?.text);
  // Read in blue, then back to amber: still on the ticker (it can only be answered in blue, and its clock runs on).
  setMode(h.store, 'memory');
  h.stepFor(0.2);
  setMode(h.store, 'tools');
  check('a read choice stays on the amber ticker while it stands', tickerEntry(state())?.id === running.id && running.unread === false);
  h.stepUntil(() => choiceSecondsLeft(openChoiceEntry(state())!.choice!) <= CHOICE_URGENT_SEC, 15);
  check(`…urgent in its last ${CHOICE_URGENT_SEC} s`, choiceTicker(state(), openChoiceEntry(state())!)?.urgent === true);
  // The ticker words and every stamp fit, and none names HOLLOW (kid-facing text, WP8 review).
  const words = [HOLLOW_DEAL.tickerWords, HOLLOW_DEAL.stampAccepted('C08'), HOLLOW_DEAL.stampRefused, HOLLOW_DEAL.stampTimeout,
    HOLLOW_HUD_TEXT.nextBiteFed, HOLLOW_HUD_TEXT.nextBiteHasted, GHOST_TEXT.status, GHOST_TEXT.pipCount(99)];
  check('the new words fit a line and never say HOLLOW', words.every((text) => text.length <= MAX_LINE_CHARS && !/hollow/i.test(text)), words.join(' | '));
  // REFUSE: FASTER on every hollow block.
  check('REFUSE answers it', pickChoice(running.id, DEAL_REFUSE));
  h.stepFor(0.1);
  const hasted = biteClock(state());
  check('…NEXT BITE reads FASTER while the haste lasts', hasted.mood === 'hasted' && hasted.key === HOLLOW_HUD_TEXT.nextBiteHasted
    && hasted.text.startsWith(HOLLOW_HUD_TEXT.nextBiteHasted), hasted.text);
  check('…and the ticker lets go of the closed choice', tickerEntry(state())?.choice?.open !== true);
}

// --- ACCEPT: FED, counting the pause in ------------------------------------------------------------------------------
{
  // A fresh run's LAST LIGHT (the deal comes once a run).
  lastLight(6);
  h.stepUntil(() => state().hollow.phase === 'awake', 60);
  h.stepUntil(() => state().hollow.deal.phase === 'offered', 30);
  const entry = openChoiceEntry(state())!;
  pickChoice(entry.id, DEAL_ACCEPT);
  h.stepFor(0.1);
  const fed = biteClock(state());
  const biteIn = state().hollow.biteInSec ?? NaN;
  check('ACCEPT: NEXT BITE reads FED and counts the pause in (bite timer + pause left)', fed.mood === 'fed'
    && fed.key === HOLLOW_HUD_TEXT.nextBiteFed && fed.secLeft !== null && Math.abs(fed.secLeft - (biteIn + DEAL_PAUSE_SEC - 0.1)) < 0.11,
    `${fed.text} (${fed.secLeft?.toFixed(2)} vs ${(biteIn + DEAL_PAUSE_SEC).toFixed(2)})`);
  // Monotonic through the pause's end: never a jump (pillar 5).
  let last = fed.secLeft ?? Infinity;
  let jumped = 0;
  h.stepUntil(() => {
    const now = biteClock(state()).secLeft;
    if (now !== null && now > last + 1e-6) jumped = now - last;
    if (now !== null) last = now;
    const pauseUntil = state().hollow.deal.pauseUntilAi;
    return pauseUntil !== null && state().clock.aiSec > pauseUntil + 1;
  }, DEAL_PAUSE_SEC + 5);
  check('…its countdown never jumps up through the pause and its end', jumped === 0, `jump ${jumped.toFixed(2)}`);
  check('…and reads NEXT BITE again after it', biteClock(state()).mood === null && biteClock(state()).key === HOLLOW_HUD_TEXT.nextBite);
}

// --- sayChoice's look -------------------------------------------------------------------------------------------------
{
  const throws = (fn: () => void): boolean => { try { fn(); return false; } catch { return true; } };
  check('a look with fewer keys than options throws', throws(() => sayChoice('hollow', '> ?', ['A', 'B'], 5, () => {}, { keys: ['Y'], tickerWords: 'X' })));
  check('two options on one key throw', throws(() => sayChoice('hollow', '> ?', ['A', 'B'], 5, () => {}, { keys: ['Y', 'Y'], tickerWords: 'X' })));
  check('a key that is not one capital letter throws', throws(() => sayChoice('hollow', '> ?', ['A', 'B'], 5, () => {}, { keys: ['Y', 'Space'], tickerWords: 'X' })));
  const id = sayChoice('hollow', '> ?', ['A', 'B'], 5, () => {});
  const plain = state().log.entries.find((candidate) => candidate.id === id)!;
  check('a choice with no look: no keys, and the ticker shows the line itself', plain.choice?.keys === null && choiceTicker(state(), plain) === null);
  withdrawChoice(id);
}

// --- The final ship's boot: HOLLOW's line closes it ----------------------------------------------------------------
function bootLastLight(seed: number): void {
  lastLight(seed);
  // LAST LIGHT as it boots: the same world, the boot's clock from 0 (shipAlone left it in flight).
  h.store.update((d) => { d.run.phase = 'boot'; d.ui.mode = 'memory'; });
  resetWorld();
}

{
  bootLastLight(8);
  const plan = bootLinePlan(state(), 0);
  const vars = lineVars(state(), getPrediction());
  const text = bootLine('hollow', state(), vars);
  check('LAST LIGHT\'s boot plan ends with HOLLOW\'s line, said by HOLLOW', plan[plan.length - 1] === 'hollow' && bootLineSpeaker('hollow') === 'hollow'
    && plan.slice(0, -1).every((kind) => bootLineSpeaker(kind) === 'mind-sys'), plan.join(','));
  check('…`> last ship, 047. i\'m so tired.` (our unit number)',
    text === HOLLOW_STORY.lastShip(state().run.unitNumber) && text === '> last ship, 047. i\'m so tired.', text);
  let saidAt: number | null = null;
  let endedAt: number | null = null;
  const start = h.wall();
  h.stepUntil(() => {
    if (saidAt === null && state().log.entries.some((entry) => entry.text === text && entry.speaker === 'hollow')) saidAt = h.wall() - start;
    if (state().run.phase === 'flight') { endedAt = h.wall() - start; return true; }
    return false;
  }, 30);
  const typing = typingSec('hollow', text);
  check('…and the cut to amber waits until it has typed (plus a beat to read it)', saidAt !== null && endedAt !== null
    && endedAt >= saidAt + typing + BOOT_AFTER_HOLLOW_LINE_SEC - 0.05, `said ${saidAt}, typed ${(saidAt ?? 0) + typing}, flight ${endedAt}`);
  // Other ships' boots have no such line (VESPER's keepCharge moved to its landing, slice 2 risk 6).
  h.shipAlone(2, 9);
  check('KESTREL\'s boot has no HOLLOW line', !bootLinePlan(state(), 0).includes('hollow'));
  h.vesper(9);
  check('VESPER\'s boot has no HOLLOW line (HOLLOW boards silent)', !bootLinePlan(state(), 0).includes('hollow'));
}

{
  bootLastLight(10);
  const text = bootLine('hollow', state(), lineVars(state(), getPrediction()));
  // Past the skip grace: a skip jumps to HOLLOW's line (the lines before it are said at once)...
  h.stepFor(1.2);
  const jumped = skipBoot(h.store);
  const said = state().log.entries.some((entry) => entry.text === text);
  check('a skip jumps to HOLLOW\'s line: it is said at once', jumped && said && state().run.phase === 'boot');
  // ...and a second skip at once does not cut it off: the cut waits until it has typed.
  const second = skipBoot(h.store);
  check('…a second skip right away is refused (it is still typing)', !second && state().run.phase === 'boot');
  h.stepUntil(() => state().run.phase === 'flight', 15);
  check('…and the boot ends on its own once it has typed', state().run.phase === 'flight');
}

void VESPER;
finish();
