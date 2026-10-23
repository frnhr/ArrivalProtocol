// WP9 acceptance 6 (§9 WP9): the run flow now plays 3 ships, headless. Title → ARES-VII → HALCYON → KESTREL →
// RUN END, flown by the strip-following kid with the defender (WP7), on KESTREL also repairing the blind Sensor
// Interp and DELETEing seeds that can bite, and pressing [B] when AUTOBURN is offered. On KESTREL:
// • its boot: the crossing's ECC line, then its own arrival damage `> ECC: SENSOR INTERP 45% — PATH UNCERTAIN`,
//   the charge, and `> SKILL TRAINED: AUTOBURN.skl · from your 2 captures · ACCURACY n%` (the two manual captures of
//   ships 1–2: the lead's note, the reward said as it installs);
// • the flight opens blind (PATH UNCERTAIN — [TAB], REPAIR SENSOR INTERP), the sensor repaired, TOO WIDE promises
//   the dodge, the early IN correction clears the debris (0 hits), HOLLOW wakes and bites, its first seed comes with
//   DELETE and `> sorry. i'm so hungry.` on the coast (SKIP waits for it), AUTOBURN flies the capture through to
//   the lock (WP9 fix round 1: TOO WIDE counts the dodge down; AUTOBURN no longer hands back at loop-closed);
// • after KESTREL the run goes on to VESPER (WP10: KESTREL is no longer the last ship).
import { check, finish } from '../wp1/harness';
import { createHarness9, KESTREL } from './harness9';
import { receiveTransmission } from '@systems/boot';
import { continueAfterReport } from '@systems/run';
import { autoburnAvailable, autoburnSkill } from '@systems/autoburn';
import { getPrediction } from '@systems/predict';
import { followDirector } from '../wp2/harness2';
import { getOps } from '@systems/ops-core';
import { resetReport } from '@systems/reset';
import { assertMemoryInvariants } from '@systems/memory-ops';
import { scriptedDamageLine, transitEccLine } from '@data/script';
import { HOLLOW_STORY } from '@data/hollow-text';
import { AUTOBURN_TEXT } from '@data/skill-text';
import { MEMORY_TOTAL_BLOCKS } from '@data/memory';
import { getShip } from '@data/ships';

const SEED = 21;
const h = createHarness9(SEED, { soulsFound: false });
const state = () => h.store.getState();

h.newRun(SEED);
receiveTransmission(h.store);
h.stepUntil(() => state().run.phase === 'flight', 15);
h.flyDefending9(600);
check('ARES-VII: locked', h.status() === 'locked', h.status());
check('…to its WAKE REPORT', h.untilPhase('report', 300));
continueAfterReport(h.store);
h.transmit();
h.stepUntil(() => state().run.phase === 'flight', 20);
check('HALCYON boots and flies', state().level.shipName === 'HALCYON' && state().run.phase === 'flight');
h.flyDefending9(900);
check('HALCYON: locked', h.status() === 'locked', h.status());
check('…to its WAKE REPORT', h.untilPhase('report', 300));
const demos = state().run.stats.demos.length;
check('two manual captures recorded (the skill\'s training)', demos === 2 && state().run.stats.manualCaptures === 2, JSON.stringify(state().run.stats.demos));
continueAfterReport(h.store);
check('HALCYON is not the last ship: CONTINUE → TRANSMIT to KESTREL', state().run.phase === 'transmit' && state().run.transit?.toShipIndex === KESTREL);
const logFrom = state().log.entries.length;
h.transmit();

// --- KESTREL's boot -------------------------------------------------------------------------------------------
const arrival = state().run.arrival!;
check('KESTREL: the crossing dealt its 4 hits, and the ship\'s own damage set Sensor Interp to 45',
  arrival.hits.length === getShip(KESTREL).arrival!.transitHits && arrival.scripted.length === 1 && arrival.scripted[0]!.role === 'sensor'
  && arrival.scripted[0]!.to === 45, JSON.stringify(arrival.scripted));
h.stepUntil(() => state().run.phase === 'flight', 25);
const bootLines = state().log.entries.slice(logFrom).filter((entry) => entry.speaker === 'mind-sys').map((entry) => entry.text);
const skill = autoburnSkill(state().run.stats)!;
const eccAt = bootLines.indexOf(transitEccLine(arrival.hits));
const scriptedAt = bootLines.indexOf(scriptedDamageLine(arrival.scripted));
const skillAt = bootLines.indexOf(AUTOBURN_TEXT.trained(2, skill.accuracy));
check('the boot: the ECC line, then `> ECC: SENSOR INTERP 45% — PATH UNCERTAIN`, the charge, then the skill trained',
  eccAt >= 0 && scriptedAt === eccAt + 1 && bootLines[scriptedAt] === '> ECC: SENSOR INTERP 45% — PATH UNCERTAIN' && skillAt > scriptedAt + 1,
  bootLines.join(' | '));
check('…AUTOBURN.skl is in rack E', state().memory.some((seg) => seg.type === 'upgrade' && seg.upgrade === 'autoburn'));
check('KESTREL flies: blind at first (PATH UNCERTAIN)', h.caps().plot.mode === 'uncertain' && /^PATH UNCERTAIN/.test(h.objective()?.text ?? ''), h.objective()?.text);

// --- KESTREL's flight ------------------------------------------------------------------------------------------
let pressedAuto = false;
let sawDodge = false;
let sawRmLine = false;
let autoDone = false;
let firstSeedFlight: string | null = null;
const texts = followDirector(h, {
  reactionSec: 0.4,
  maxWall: 1200,
  mistake: () => {
    h.defend9();
    const text = h.shown()?.text ?? '';
    if (/to dodge DEBRIS C/.test(text)) sawDodge = true;
    if (firstSeedFlight === null && state().hollow.seedMoments > 0) firstSeedFlight = `${state().run.phase}/${h.objective()?.id ?? 'none'}`;
    if (/RM THE SEED/.test(text)) sawRmLine = true;
    if (state().burn.auto.phase === 'done') autoDone = true;
    // The kid takes the reward: [B] when AUTO is offered (§5.1 7:00).
    if (!pressedAuto && autoburnAvailable(state(), getPrediction())) { h.press('KeyB'); pressedAuto = true; }
    return false;
  },
});
check('the sensor was repaired and TOO WIDE promised the dodge', state().memory.some((seg) => seg.role === 'sensor' && 'integrity' in seg && seg.integrity === 100) && sawDodge,
  texts.slice(0, 6).join(' | '));
check('the early IN correction cleared the debris: 0 hits', h.zoneHits().length === 0, JSON.stringify(h.zoneHits()));
check('HOLLOW woke and bit; its first seed came with DELETE and `> sorry. i\'m so hungry.`',
  h.events.some((event) => event.name === 'hollow-infect') && state().run.licences.includes('delete')
  && state().log.entries.some((entry) => entry.text === HOLLOW_STORY.sorry), `seeds landed ${state().hollow.seedsLanded}`);
// WP9 fix round 1: SKIP waits for the first seed (SOMETHING IS COMING), so it comes on the coast, under a WAIT.
check('…the first seed came on the coast (a WAIT), not mid-capture', firstSeedFlight !== null && /^flight\/F10-wait/.test(firstSeedFlight), String(firstSeedFlight));
check('AUTOBURN was pressed and flew the capture through (into the ring)', pressedAuto && autoDone && state().burn.auto.end === 'in-ring',
  `${pressedAuto} ${autoDone} ${state().burn.auto.end}`);
check('KESTREL: locked', h.status() === 'locked', `${h.status()} | ${texts.slice(-6).join(' | ')}`);
const printEnd = h.wall() + 400;
while (state().run.phase !== 'report' && h.wall() < printEnd) {
  h.defend9();
  h.step();
  if (/RM THE SEED/.test(h.shown()?.text ?? '')) sawRmLine = true;
}
check('…to its WAKE REPORT', state().run.phase === 'report', state().run.phase);
// The defender DELETEs a seed that can bite at once, so the lesson may be done before it is ever shown (a seed that
// lands during the capture burn: the burn's NOW lines come first, and the seed is gone within its 2 s DELETE).
const lessonDone = state().director.done.some((id) => id === 'hollow-seed-first' || id === 'hollow-seed-first-tab');
check('…the first seed: its lesson is done (shown as RM THE SEED, or the seed DELETEd before it could be)', lessonDone
  && state().hollow.seedsLanded >= 1, `seeds ${state().hollow.seedsLanded}, shown ${sawRmLine}`);
const results = state().souls.results;
check('…all twelve clusters left memory', results.length === 12, results.map((result) => `${result.cluster}:${result.outcome}`).join(' '));

// --- On to VESPER ----------------------------------------------------------------------------------------------
// WP10: KESTREL is no longer the last ship: its CONTINUE transmits to VESPER (ship 4; the four-ship run to RUN END is
// tests/unit/wp10/run-flow.test.ts).
continueAfterReport(h.store);
check('after KESTREL (no longer the last ship, WP10) CONTINUE → TRANSMIT to VESPER, with 3 ship results',
  state().run.phase === 'transmit' && state().run.transit?.toShipIndex === 3 && state().run.ships.length === 3,
  `${state().run.phase} ${state().run.transit?.toShipIndex} ${state().run.ships.length}`);
check('…no op running, memory valid', getOps().length === 0 && (() => { try { assertMemoryInvariants(state().memory, MEMORY_TOTAL_BLOCKS); return true; } catch { return false; } })());
h.newRun(SEED + 1);
check('NEW RUN: every reset module in its initial state', resetReport().length === 0, JSON.stringify(resetReport()));

finish();
