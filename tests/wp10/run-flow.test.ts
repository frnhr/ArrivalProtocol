// WP10 acceptance 5 (§9 WP10): the run flow now plays 4 ships, headless. Title → ARES-VII → HALCYON → KESTREL → VESPER →
// RUN END, flown by the strip-following kid with the defenders (WP7's REPAIR and MOVE, WP9's sensor and seeds, [B] when
// AUTOBURN is offered) and on VESPER the pip → SWAP the strip teaches. On VESPER:
// • its boot: the crossing's ECC line and the charge, but no line about its Thrust Ctrl (a ship file: hidden until
//   scanned; it arrives at 31%, unscanned);
// • COPY licensed at the flight's first moment; the engine fires by itself (the first burst's alarm, SWAP licensed with
//   it); the kid follows the lesson (the THRUST CTRL pip, SWAP to Thrust.alt), and the engine falls silent;
// • HOLLOW wakes and bites, THE DEAL is offered (the kid refuses), its first seed hunts a tool;
// • locked, printed, and (WP11) TRANSMIT on to LAST LIGHT with 4 ship results; a NEW RUN resets every module.
import { check, finish } from '../wp1/harness';
import { createHarness10, VESPER } from './harness10';
import { receiveTransmission } from '@systems/boot';
import { continueAfterReport } from '@systems/run';
import { autoburnAvailable } from '@systems/autoburn';
import { getPrediction } from '@systems/predict';
import { followDirector } from '../wp2/harness2';
import { getOps } from '@systems/ops-core';
import { pickChoice } from '@systems/say';
import { DEAL_REFUSE } from '@systems/hollow-deal';
import { resetReport } from '@systems/reset';
import { assertMemoryInvariants } from '@systems/memory-ops';
import { transitEccLine } from '@data/script';
import { MEMORY_TOTAL_BLOCKS } from '@data/memory';
import { getShip } from '@data/ships';
import { GHOST_ALARM_ID } from '@systems/alerts';
import { hasIntegrity } from '@state/selectors';

const SEED = 21;
const h = createHarness10(SEED, { soulsFound: false });
const state = () => h.store.getState();

// The kid's [B] when AUTOBURN is offered (WP9's flow), on every ship from KESTREL on.
const flyShip = (maxWall: number): string[] => followDirector(h, {
  reactionSec: 0.4,
  maxWall,
  mistake: () => {
    h.defend10();
    if (state().burn.auto.phase === 'idle' && autoburnAvailable(state(), getPrediction())) h.press('KeyB');
    return false;
  },
});

h.newRun(SEED);
receiveTransmission(h.store);
h.stepUntil(() => state().run.phase === 'flight', 15);
for (const name of ['ARES-VII', 'HALCYON', 'KESTREL']) {
  check(`${name} flies`, state().level.shipName === name && state().run.phase === 'flight', `${state().level.shipName} ${state().run.phase}`);
  flyShip(1200);
  check(`${name}: locked`, h.status() === 'locked', h.status());
  check('…to its WAKE REPORT', h.untilPhase('report', 400), state().run.phase);
  continueAfterReport(h.store);
  check(`…not the last ship: CONTINUE → TRANSMIT`, state().run.phase === 'transmit', state().run.phase);
  if (state().run.phase !== 'transmit') break;
  if (state().run.transit?.toShipIndex === VESPER) break;
  h.transmit();
  h.stepUntil(() => state().run.phase === 'flight', 25);
}
check('KESTREL transmits to VESPER (ship 4)', state().run.transit?.toShipIndex === VESPER);
const logFrom = state().log.entries.length;
h.transmit();

// --- VESPER's boot ---------------------------------------------------------------------------------------------------
const arrival = state().run.arrival!;
check('VESPER: the crossing dealt its 5 hits; the ship\'s own Thrust Ctrl is no arrival line (a ship file, hidden)',
  arrival.hits.length === getShip(VESPER).arrival!.transitHits && arrival.scripted.length === 0, JSON.stringify(arrival.scripted));
const thrust = state().memory.find((seg) => seg.role === 'thrust-ctrl');
check('…its Thrust Ctrl is at 31%, unscanned', thrust !== undefined && hasIntegrity(thrust) && thrust.integrity === 31
  && thrust.type === 'ship' && !thrust.scanned);
h.stepUntil(() => state().run.phase === 'flight', 25);
const bootLines = state().log.entries.slice(logFrom).filter((entry) => entry.speaker === 'mind-sys').map((entry) => entry.text);
check('…its boot: the crossing\'s ECC line, the charge, nothing about THRUST', bootLines.includes(transitEccLine(arrival.hits))
  && !bootLines.some((line) => /THRUST/.test(line)), bootLines.join(' | '));

// --- VESPER's flight ---------------------------------------------------------------------------------------------------
let alarmSeen = false;
let refused = false;
let sawLesson = false;
let copyLine = false;
const texts = followDirector(h, {
  reactionSec: 0.4,
  maxWall: 1200,
  mistake: () => {
    h.defend10();
    if (state().alerts.list.some((alert) => alert.id === GHOST_ALARM_ID)) alarmSeen = true;
    const shown = state().director.shown?.id ?? '';
    if (shown.startsWith('tut-ghost')) sawLesson = true;
    if (shown.startsWith('tut-copy-repair')) copyLine = true;
    // The kid refuses THE DEAL the moment it is offered (before the defender's MOVE of the named cluster withdraws it).
    const deal = state().hollow.deal;
    if (!refused && deal.phase === 'offered' && deal.entryId !== null) refused = pickChoice(deal.entryId, DEAL_REFUSE);
    if (state().burn.auto.phase === 'idle' && autoburnAvailable(state(), getPrediction())) h.press('KeyB');
    return false;
  },
});
check('COPY was licensed', state().run.licences.includes('copy'));
check('the engine fired by itself: the first burst\'s alarm, SWAP licensed with it', alarmSeen && state().run.licences.includes('swap')
  && state().burn.ghostBursts >= 1, `bursts ${state().burn.ghostBursts}`);
check('…the lesson stood, and the kid swapped: Thrust.old, the engine silent', sawLesson && state().memory.some((seg) => seg.name === 'Thrust.old'));
check('HOLLOW woke and bit; THE DEAL was offered and refused', h.events.some((event) => event.name === 'hollow-infect') && refused
  && state().run.stats.deal?.outcome === 'refused', JSON.stringify(state().run.stats.deal));
check('VESPER: locked', h.status() === 'locked', `${h.status()} | ${texts.slice(-6).join(' | ')}`);
const printEnd = h.wall() + 400;
while (state().run.phase !== 'report' && h.wall() < printEnd) {
  h.defend10();
  h.step();
  if ((state().director.shown?.id ?? '').startsWith('tut-copy-repair')) copyLine = true;
}
check('…to its WAKE REPORT', state().run.phase === 'report', state().run.phase);
check('…a seed came for the tools (and the COPY lesson stood, or a seed\'s RM line came first)', state().hollow.seedMoments > 0
  && (copyLine || state().hollow.seedsLanded > 0), `moments ${state().hollow.seedMoments} landed ${state().hollow.seedsLanded} copy line ${copyLine}`);
check('…all twelve clusters left memory', state().souls.results.length === 12, state().souls.results.map((result) => `${result.cluster}:${result.outcome}`).join(' '));

// --- On to LAST LIGHT ------------------------------------------------------------------------------------------------
// WP11: VESPER is no longer the last ship: its report transmits to LAST LIGHT (ship 5, flown on in
// tests/wp11/full-run.test.ts), with 4 ship results so far, no op running and memory valid.
continueAfterReport(h.store);
check('after VESPER the run goes on: TRANSMIT to LAST LIGHT (ship 5) with 4 ship results',
  state().run.phase === 'transmit' && state().run.transit?.toShipIndex === 4 && state().run.ships.length === 4,
  `${state().run.phase} ${state().run.transit?.toShipIndex} ${state().run.ships.length}`);
check('…no op running, memory valid', getOps().length === 0 && (() => { try { assertMemoryInvariants(state().memory, MEMORY_TOTAL_BLOCKS); return true; } catch { return false; } })());
h.newRun(SEED + 1);
check('NEW RUN: every reset module in its initial state', resetReport().length === 0, JSON.stringify(resetReport()));

finish();
