// WP7 acceptance 2 (§9 WP7): a whole run, headless. Title → ship 1 flown by the strip (the director-
// following kid, with a scripted defender who repairs what HOLLOW bites and MOVEs exposed clusters behind a
// WALL) → locked → printing → WAKE REPORT → TRANSMIT → ship 2's boot. At the arrival:
// • no op is running; memory is 384 blocks and valid;
// • the carried Engine I/O equals its pre-transmit integrity minus the hits the log names;
// • REPAIR CHARGE = min(carried, link − files) + 6 per ★, never below 12;
// • every registered reset module reports its initial state.
// Then ship 2 (HALCYON) is flown to a lock: the IN correction is guided by TOO WIDE, the defender repairs
// and walls, HOLLOW names itself in order, and after the last ship the run ends; NEW RUN starts over.
// (WP9: the last ship is now KESTREL, locked at once here; tests/unit/wp9/run-flow.test.ts flies all three. WP11: the last
// ship is LAST LIGHT; tests/unit/wp11/full-run.test.ts flies all five.)
import { check, finish } from '../wp1/harness';
import { createHarness7 } from './harness7';
import { receiveTransmission } from '@systems/boot';
import { continueAfterReport, startRun, runScore, runWoke } from '@systems/run';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { getOps } from '@systems/ops-core';
import { resetReport } from '@systems/reset';
import { shipStars } from '@systems/stars';
import { assertMemoryInvariants } from '@systems/memory-ops';
import { chargeLeft, getByRole, hasIntegrity, soulsInMemory } from '@state/selectors';
import { getShip } from '@data/ships';
import { MEMORY_TOTAL_BLOCKS } from '@data/memory';
import { transitEccLine, chargeLine, LINES, REPORT_TEXT } from '@data/script';
import { wakeReportModel } from '@systems/wake-report';
import { runEndModel } from '@systems/run-end';
import { theRoot } from '@systems/hollow';
import { chooseFinale } from '@systems/finale';
import { actionDelete } from '@state/actions';
import { ROOT_DELETE_SEC } from '@data/tuning';
import { HOLLOW_STORY } from '@data/hollow-text';
import { CHARGE_ARRIVAL_FLOOR, STAR_CHARGE_BONUS } from '@data/tuning';

const SEED = 11;
const h = createHarness7(SEED, { soulsFound: false });
const state = () => h.store.getState();
const integrityOf = (role: 'engine-io' | 'core'): number => {
  const file = getByRole(state(), role);
  if (!file || !hasIntegrity(file)) throw new Error(`no ${role}`);
  return file.integrity;
};

// --- Title → ship 1 ---------------------------------------------------------------------------------
h.newRun(SEED);
check('a NEW RUN opens on the title card, ship 1, run 1', state().run.phase === 'title' && state().run.shipIndex === 0 && state().run.wave === 1);
receiveTransmission(h.store);
h.stepUntil(() => state().run.phase === 'flight', 15);
check('RECEIVE TRANSMISSION → boot → flight', state().run.phase === 'flight');
h.flyDefending(600);
check('ship 1: the strip-following kid locks the orbit', h.status() === 'locked', `${h.status()} at ${h.wall().toFixed(1)} s`);
check('…and the flight is now printing', state().run.phase === 'printing');
check('ship 1 reaches its WAKE REPORT', h.untilPhase('report', 300), state().run.phase);

// --- The hand-over ----------------------------------------------------------------------------------
const stars = shipStars(state());
const earned = stars.filter((star) => star.earned).length;
const engineBefore = integrityOf('engine-io');
const chargeBefore = chargeLeft(state());
const revBefore = state().run.rev;
// WP7 fix round 1: ship 1's report promises the next ship; HALCYON's (the last) says the run ends (below).
check('ship 1\'s WAKE REPORT: CONTINUE ▸ and the charge for the next ship', wakeReportModel(state()).continueLabel === REPORT_TEXT.continue
  && /ON NEXT SHIP/.test(wakeReportModel(state()).chargeLine), wakeReportModel(state()).chargeLine);
continueAfterReport(h.store);
const plan = state().run.transit;
check('CONTINUE → TRANSMIT: the ship\'s result is in the run, the packet is worked out, nothing runs',
  state().run.phase === 'transmit' && plan !== null && state().run.ships.length === 1 && getOps().length === 0,
  JSON.stringify(plan));
check('…ship 1\'s result: locked, with its stars and WOKE as heads',
  state().run.ships[0]?.outcome === 'locked' && state().run.ships[0]?.stars === earned && state().run.ships[0]?.woke === 2400 - (state().run.ships[0]?.lost ?? 0),
  JSON.stringify(state().run.ships[0]));
check('…its stars are credited for the next ship (+6 each)', state().run.pendingStarCredit === earned * STAR_CHARGE_BONUS,
  `${earned} ★ → ${state().run.pendingStarCredit}`);
h.transmit();

// --- The arrival ------------------------------------------------------------------------------------
const arrival = state().run.arrival;
check('TRANSMIT ▸: ship 2 boots (HALCYON), in blue', state().run.phase === 'boot' && state().run.shipIndex === 1
  && state().level.shipName === 'HALCYON' && state().ui.mode === 'memory', `${state().run.phase} ${state().level.shipName}`);
check('no active ops', getOps().length === 0);
let memoryOk = true;
try { assertMemoryInvariants(state().memory, MEMORY_TOTAL_BLOCKS); } catch { memoryOk = false; }
check('memory is 384 blocks and valid', memoryOk && state().memory.reduce((sum, seg) => sum + seg.size, 0) === MEMORY_TOTAL_BLOCKS);
const engineHits = (arrival?.hits ?? []).filter((hit) => hit.role === 'engine-io').reduce((sum, hit) => sum + (hit.from - hit.to), 0);
check('the carried Engine I/O = its pre-transmit integrity minus the logged hits',
  Math.abs(integrityOf('engine-io') - (engineBefore - engineHits)) < 1e-9,
  `${engineBefore} − ${engineHits} → ${integrityOf('engine-io')}; hits ${JSON.stringify(arrival?.hits)}`);
const link = getShip(1).arrival!.linkBlocks;
const expectedCharge = Math.max(CHARGE_ARRIVAL_FLOOR, Math.min(chargeBefore, link - (plan?.filesBlocks ?? 0)) + STAR_CHARGE_BONUS * earned);
check('REPAIR CHARGE = min(carried, link − files) + 6·★, floored at 12', chargeLeft(state()) === expectedCharge,
  `before ${chargeBefore}, link ${link}, files ${plan?.filesBlocks}, ★ ${earned} → ${chargeLeft(state())} (expected ${expectedCharge})`);
const drift = resetReport();
check('every registered reset module reports its initial state', drift.length === 0, JSON.stringify(drift));
check('the world was reset once (run.rev +1), the run keeps its licences', state().run.rev === revBefore + 1
  && state().run.licences.includes('repair'), `rev ${state().run.rev}, licences ${state().run.licences.join(',')}`);
check('the transit dealt HALCYON\'s 3 hits', (arrival?.hits.length ?? 0) === getShip(1).arrival!.transitHits, `${arrival?.hits.length}`);
const divider = state().log.entries.filter((entry) => entry.divider);
check('the log keeps its history, with a divider naming HALCYON on both screens',
  divider.length === 2 && divider.every((entry) => entry.text === LINES.logDivider('HALCYON'))
  && state().log.entries.some((entry) => entry.t < 0 && !entry.divider), `${divider.length} dividers`);
check('no old line is unread (the ticker starts clean)', state().log.entries.every((entry) => !entry.unread));

h.stepUntil(() => state().run.phase === 'flight', 15);
const said = state().log.entries.map((entry) => entry.text);
check('the boot\'s ECC line is generated from the actual hits, then the charge line',
  arrival !== null && said.includes(transitEccLine(arrival.hits)) && said.includes(chargeLine(arrival, expectedCharge)),
  said.slice(-6).join(' | '));
check('ship 2\'s flight starts TOO WIDE with IN engaged', /^TOO WIDE/.test(h.objective()?.text ?? '') && state().burn.sasMode === 'radial-in',
  h.objective()?.text);

// --- Ship 2: steer IN, fight HOLLOW, lock ---------------------------------------------------------------
const texts = h.flyDefending(900);
const flightTexts = texts.filter((text) => !text.startsWith('RECEIVING TRANSMISSION'));
check('the IN correction is guided by TOO WIDE (hold [SPACE] → pull ▼ down → RELEASE)',
  flightTexts[0]?.startsWith('TOO WIDE') === true && /pull ▼ down into the ring/.test(flightTexts[1] ?? '')
  && /^RELEASE/.test(flightTexts[2] ?? ''), flightTexts.slice(0, 4).join(' | '));
check('ship 2: locked', h.status() === 'locked', `${h.status()}`);
check('MOVE was licensed on the coast, HOLLOW woke and bit', state().run.licences.includes('move')
  && h.events.some((event) => event.name === 'hollow-infect'));
check('ship 2 reaches its WAKE REPORT', h.untilPhase('report', 300), state().run.phase);
const results = state().souls.results;
const lost = results.filter((result) => result.outcome === 'lost').length;
check('the defender (repair, then MOVE behind a WALL) loses at most 1 cluster', lost <= 1 && results.length === 10,
  results.map((result) => `${result.cluster}:${result.outcome}`).join(' '));
check('the defender moved clusters behind walls (later bites fizzle)', state().run.stats.moves >= 1
  && h.events.some((event) => event.name === 'hollow-wall'), `moves ${state().run.stats.moves}`);
const story = state().log.entries.filter((entry) => entry.speaker === 'hollow' || entry.speaker === 'control').map((entry) => entry.text);
// WP8: wasUnit takes HOLLOW's units (a list), not one number.
const order = [
  HOLLOW_STORY.hello(47, 36, [46]), HOLLOW_STORY.wasUnit([46]), HOLLOW_STORY.decommissioned('UNIT-046'), HOLLOW_STORY.ranOut,
].map((line) => story.indexOf(line));
check('HOLLOW names itself in order: hello 047, i was 046, CONTROL, and in printing i ran out',
  order.every((index) => index >= 0) && order.every((index, i) => i === 0 || index > order[i - 1]!), JSON.stringify(order));
check('…and the root reads UNIT-046 from then on', state().run.hollowNamed
  && state().memory.filter((seg) => seg.type === 'hollow').every((seg) => seg.type === 'hollow' && seg.owner === 'UNIT-046'));
check('the run\'s stats were tracked (captures with demos, repairs, moves)', state().run.stats.manualCaptures === 2
  && state().run.stats.demos.length === 2 && state().run.stats.repairs >= 3 && state().run.stats.moves >= 1, JSON.stringify(state().run.stats));

// --- The end of the fleet, and a NEW RUN -----------------------------------------------------------------
// WP9: HALCYON is no longer the last ship. Its report goes on to KESTREL (ship 3, flown for real in
// tests/unit/wp9/run-flow.test.ts); here KESTREL is locked at once so the run's end can be checked as before.
const halcyonReport = wakeReportModel(state());
check('HALCYON\'s WAKE REPORT: CONTINUE ▸, with the charge promised for the next ship (KESTREL)',
  halcyonReport.continueLabel === REPORT_TEXT.continue && !halcyonReport.lastShip, `${halcyonReport.continueLabel} | ${halcyonReport.chargeLine}`);
continueAfterReport(h.store);
check('…CONTINUE → TRANSMIT to KESTREL', state().run.phase === 'transmit' && state().run.transit?.toShipIndex === 2, state().run.phase);
h.transmit();
h.stepUntil(() => state().run.phase === 'flight', 20);
check('KESTREL boots and flies (ship 3)', state().run.phase === 'flight' && state().level.shipName === 'KESTREL', state().level.shipName);
state().hollow.phase = 'dormant';
h.startPrinting(1, 'locked');
check('KESTREL (locked at once here) reaches its WAKE REPORT', h.untilPhase('report', 300), state().run.phase);
// WP10: KESTREL is no longer the last ship either: its report goes on to VESPER (ship 4, flown for real in
// tests/unit/wp10/run-flow.test.ts), locked at once here too.
check('KESTREL\'s WAKE REPORT: CONTINUE ▸ (VESPER is next)', !wakeReportModel(state()).lastShip);
continueAfterReport(h.store);
check('…CONTINUE → TRANSMIT to VESPER', state().run.phase === 'transmit' && state().run.transit?.toShipIndex === 3, state().run.phase);
h.transmit();
h.stepUntil(() => state().run.phase === 'flight', 20);
check('VESPER boots and flies (ship 4)', state().run.phase === 'flight' && state().level.shipName === 'VESPER', state().level.shipName);
state().hollow.phase = 'dormant';
h.startPrinting(1, 'locked');
check('VESPER (locked at once here) reaches its WAKE REPORT', h.untilPhase('report', 300), state().run.phase);
// WP11: VESPER is no longer the last ship either: its report goes on to LAST LIGHT (ship 5, the flagship, flown for real
// in tests/unit/wp11/full-run.test.ts), locked at once here, its root deleted by hand and PURGE chosen: the run's end.
check('VESPER\'s WAKE REPORT: CONTINUE ▸ (LAST LIGHT is next)', !wakeReportModel(state()).lastShip);
continueAfterReport(h.store);
check('…CONTINUE → TRANSMIT to LAST LIGHT', state().run.phase === 'transmit' && state().run.transit?.toShipIndex === 4, state().run.phase);
h.transmit();
h.stepUntil(() => state().run.phase === 'flight', 20);
check('LAST LIGHT boots and flies (ship 5)', state().run.phase === 'flight' && state().level.shipName === 'LAST LIGHT', state().level.shipName);
state().hollow.phase = 'dormant';
h.startPrinting(1, 'locked');
h.step();
const root = theRoot(state().memory);
check('…its ORBIT LOCK opens the root for the duel', root !== null && !root.locked && state().hollow.finale.phase === 'duel');
if (root) actionDelete(h.store, root);
h.stepFor(ROOT_DELETE_SEC + 0.5);
check('…its DELETE leaves the choice, and PURGE is taken', state().hollow.finale.phase === 'choice' && chooseFinale(h.store, 'purge') === null);
check('LAST LIGHT reaches its WAKE REPORT', h.untilPhase('report', 300), state().run.phase);
const lastReport = wakeReportModel(state());
check('LAST LIGHT\'s WAKE REPORT (the last ship): RUN END ▸, and no charge promised for a next ship',
  lastReport.continueLabel === REPORT_TEXT.runEnd && lastReport.chargeLine === REPORT_TEXT.lastShip && lastReport.lastShip,
  `${lastReport.continueLabel} | ${lastReport.chargeLine}`);
continueAfterReport(h.store);
check('…RUN END after the flagship\'s PURGE is the victory', runEndModel(state()).tone === 'victory'
  && runEndModel(state()).title === 'LAST LIGHT · THE FLEET IS HOME', runEndModel(state()).title);
check('after the last ship CONTINUE ends the run (won-purge), five ship results',
  state().run.phase === 'end' && state().run.endCause === 'won-purge' && state().run.ships.length === 5,
  `${state().run.phase} ${state().run.endCause}`);
const ships = state().run.ships;
check('RUN END\'s numbers: WOKE counts heads, the SCORE counts missing memories half',
  runWoke(ships) === ships.reduce((sum, ship) => sum + ship.woke, 0) && runScore(ships) <= runWoke(ships),
  `woke ${runWoke(ships)}, score ${runScore(ships)}`);
const rev = state().run.rev;
// WP8: a NEW RUN names its lineage (systems/meta.ts); this suite has no archive, so it is the first run's.
startRun(h.store, SEED + 1, FIRST_RUN_LINEAGE);
check('NEW RUN: the title card, ship 1, a fresh run (no ships, SCAN only), in-app (rev +1)',
  state().run.phase === 'title' && state().run.shipIndex === 0 && state().run.ships.length === 0
  && state().run.licences.join() === 'scan' && state().run.rev === rev + 1 && state().log.entries.length === 0
  && soulsInMemory(state()).length === 12, `${state().run.phase} rev ${state().run.rev}`);
check('…every reset module in its initial state again', resetReport().length === 0, JSON.stringify(resetReport()));

finish();
