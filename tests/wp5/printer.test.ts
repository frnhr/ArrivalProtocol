// WP5 acceptance 3: the printer (§6.7), driven through the real clock, predictor, capabilities and
// ops core. Printer range comes from the TRUE prediction: each scenario puts the ship on a closed
// orbit with exactly that time-weighted share inside the ring, then ends the flight there.
// • 12 clusters at range 1.0 print in 30 ± 0.5 AI-s; at 0.5 in 60 ± 1; at 0.3 in 60 ± 1, with ≈40%
//   of the clusters waking with gaps over 500 seeds;
// • a failing Printer Uplink doubles the interval, a dead one halts printing;
// • infected clusters are skipped; a 71% cluster prints half; PRINT FAST makes the interval ×0.25;
// plus the spec's edge cases (moving, a repair aborted on print, the Uplink damaged mid-print,
// PRINT NEXT on a cluster that can't print, an ACCEPT that strands the ship), the order, the echo and
// the WAKE REPORT phase. Fix round 1: a cluster being moved is counted once everywhere.
import { check, finish, TICK } from '../wp1/harness';
import { createHarness5 } from './harness5';
import { getPrediction } from '@systems/predict';
import { setPrintFast, setPrintNext, printCluster, printIntervalSec, isPrintable } from '@systems/printer';
import { actionRepair, actionMove } from '@state/actions';
import { getOps } from '@systems/ops-core';
import { installTool } from '@systems/licences';
import { openArchive } from '@state/initial';
import { resetWorld } from '@systems/reset';
import { soulCounts, chargeLeft, soulsInMemory } from '@state/selectors';
import { createInitialState } from '@state/initial';
import { printStatus } from '@systems/printer';
import { intactTally } from '@systems/stars';
import { acceptOrbit } from '@systems/flight-controls';
import { lineVars } from '@data/script';
import { memStatsModel } from '@components/memory-view/MemoryStats';
import { orbitForRange } from './harness5';
import { stateFromElements } from '@/types/orbit';
import { PRINT_DONE_LINGER_SEC, STRANDED_RANGE_FRAC, NO_PRINTER_GIVE_UP_SEC } from '@data/tuning';

const h = createHarness5(1, { soulsFound: true });
const printed = (): { cluster: string; outcome: string; wall: number }[] => h.events
  .filter((event) => event.name === 'cluster-printed')
  .map((event) => ({ ...(event.payload as { cluster: string; outcome: string }), wall: event.wall }));

// A fresh ship-1 state with the colonists found and C09 healed (so outcomes only follow the range).
function fresh(seed = 1, healC09 = true): void {
  h.resetTo('flight', seed);
  if (healC09) h.soul('C09').integrity = 100;
  h.events.length = 0;
}

// Prints everything at `range` and returns the AI seconds from the lock to the last print.
function printAll(range: number): { lastAt: number; count: number; startWall: number } {
  h.startPrinting(range);
  const startWall = h.wall();
  h.stepUntil(() => h.store.getState().run.phase !== 'printing', 400);
  const prints = printed();
  return { lastAt: (prints.at(-1)?.wall ?? Infinity) - startWall, count: prints.length, startWall };
}

// --- Ranges ------------------------------------------------------------------------------------------
{
  fresh();
  const run = printAll(1);
  check('range 1.0: the true printer range is 100%', Math.abs(getPrediction().greenFraction - 1) < 1e-9, `${getPrediction().greenFraction}`);
  check('range 1.0: 12 clusters print in 30 ± 0.5 AI-s', run.count === 12 && Math.abs(run.lastAt - 30) <= 0.5, `${run.count} in ${run.lastAt.toFixed(2)} s`);
  const prints = printed();
  check('range 1.0: in address order C01 … C12, all intact', prints.map((print) => print.cluster).join() === 'C01,C02,C03,C04,C05,C06,C07,C08,C09,C10,C11,C12'
    && prints.every((print) => print.outcome === 'woke'));
  check('range 1.0: one every 2.5 s', prints.every((print, i) => i === 0 || Math.abs(print.wall - prints[i - 1]!.wall - 2.5) <= TICK + 1e-9));
  const state = h.store.getState();
  check('done: the WAKE REPORT phase after the linger, every result recorded, nothing left in memory', state.run.phase === 'report'
    && state.souls.results.length === 12 && h.souls().length === 0
    && Math.abs(h.wall() - run.startWall - run.lastAt - PRINT_DONE_LINGER_SEC) <= 2 * TICK + 1e-9, `${(h.wall() - run.startWall - run.lastAt).toFixed(2)} s after`);
  const counts = soulCounts(state);
  // WP7 fix round 1: SoulCounts counts heads in `heads`; the intact ones are `intact` (was `woke`), and the
  // half-credit `score` is RUN END's runScore only.
  check('done: 2,400 woke, all intact', counts.intact === 2400 && counts.heads === 2400 && counts.inMemory === 0);
  const echoes = h.log().filter((entry) => entry.speaker === 'cmd').map((entry) => entry.text);
  check('each print echoes in the TERMINAL: > print c01 ... 200 WOKE', echoes.length === 12 && echoes[0] === '> print c01 ... 200 WOKE', echoes[0]);
  let invariants = true;
  try { h.step(); } catch { invariants = false; }
  check('the report phase stops the world (no ticks of the sim, no AI time)', invariants && h.store.getState().clock.aiSec === state.clock.aiSec);
}
{
  fresh();
  const run = printAll(0.5);
  check('range 0.5: 12 clusters print in 60 ± 1 AI-s', run.count === 12 && Math.abs(run.lastAt - 60) <= 1, `${run.count} in ${run.lastAt.toFixed(2)} s, range ${getPrediction().greenFraction.toFixed(3)}`);
  check('range 0.5: no low-range gaps (the roll starts below 0.5)', printed().every((print) => print.outcome === 'woke'));
}
{
  fresh();
  const run = printAll(0.3);
  check('range 0.3: 12 clusters print in 60 ± 1 AI-s (the interval floor)', run.count === 12 && Math.abs(run.lastAt - 60) <= 1, `${run.lastAt.toFixed(2)} s, range ${getPrediction().greenFraction.toFixed(3)}`);
}
{
  // The low-range roll over 500 seeds: each seed's printer stream, 12 intact clusters at 0.3.
  let gaps = 0;
  let total = 0;
  for (let seed = 1; seed <= 500; seed++) {
    h.store.update((d) => {
      Object.assign(d, createInitialState({ seed }));
      openArchive(d);
    });
    resetWorld();
    for (const soul of h.souls()) soul.integrity = 100;
    for (const soul of [...h.souls()]) {
      total++;
      if (printCluster(h.store, soul, 0.3).outcome === 'gaps') gaps++;
    }
  }
  const share = gaps / total;
  check('range 0.3 over 500 seeds: ≈40% wake with gaps (p = (0.5 − 0.3) × 2)', Math.abs(share - 0.4) <= 0.03, `${(share * 100).toFixed(1)}% of ${total}`);
}

// --- The Printer Uplink -----------------------------------------------------------------------------------
{
  fresh();
  h.setIntegrity('printer', 30);
  h.startPrinting(1);
  const firstAt = h.stepUntil(() => printed().length > 0, 30);
  check('Printer Uplink failing: the interval doubles (the first print at 5.0 s)', Math.abs(firstAt - 5) <= TICK + 1e-9, `${firstAt.toFixed(2)} s`);
  h.setIntegrity('printer', 10);
  // WP7: a halt is no longer for ever (NO_PRINTER_GIVE_UP_SEC, then the unprinted are lost; tests/wp7 tests
  // it), so the halt is watched for a little less than that.
  h.stepUntil(() => false, NO_PRINTER_GIVE_UP_SEC - 1);
  check('Printer Uplink dead: printing halts (NO PRINTER)', printed().length === 1 && h.store.getState().run.phase === 'printing'
    && h.shown()?.id === 'print-halted', `${printed().length} printed, strip ${h.shown()?.id}`);
  h.setIntegrity('printer', 100);
  const resumedAt = h.stepUntil(() => printed().length > 1, 30);
  check('…repaired (debug): printing resumes where it stopped', printed().length === 2 && resumedAt <= 2.5 + TICK, `${resumedAt.toFixed(2)} s`);
}
{
  fresh();
  h.startPrinting(1);
  h.stepUntil(() => printed().length === 4, 30);
  h.setIntegrity('printer', 30);
  const before = h.wall();
  h.stepUntil(() => printed().length === 5, 30);
  check('the Printer Uplink damaged mid-print: the next print takes about twice as long', h.wall() - before > 2.5 && h.wall() - before <= 5 + TICK,
    `${(h.wall() - before).toFixed(2)} s`);
}

// --- Skips, outcomes, PRINT FAST and PRINT NEXT --------------------------------------------------------
{
  fresh(1, false);
  h.soul('C01').infected = { side: 'right' };
  h.startPrinting(1);
  h.stepUntil(() => printed().length === 3, 30);
  check('an infected cluster is skipped: C02, C03, C04 print first', printed().map((print) => print.cluster).join() === 'C02,C03,C04', printed().map((print) => print.cluster).join());
  delete h.soul('C01').infected;
  h.stepUntil(() => printed().length === 4, 30);
  check('…cured, it prints next (the lowest address)', printed()[3]?.cluster === 'C01');
  h.stepUntil(() => h.store.getState().run.phase !== 'printing', 60);
  const c09 = printed().find((print) => print.cluster === 'C09');
  check('the 71% cluster (C09 · REYES) prints half: WOKE WITH MISSING MEMORIES', c09?.outcome === 'gaps');
  const counts = soulCounts(h.store.getState());
  check('counts: 2,200 intact, 200 with gaps, 2,400 heads', counts.intact === 2200 && counts.wokeWithGaps === 200 && counts.heads === 2400);
  check('the echo names the gaps: > print c09 ... 200 WOKE · MISSING MEMORIES',
    h.log().some((entry) => entry.text === '> print c09 ... 200 WOKE · MISSING MEMORIES'));
}
{
  fresh();
  h.startPrinting(1);
  h.stepFor(0.5);
  check('in amber the strip says PRINTING THE COLONISTS · 0/12 — [TAB] to watch them wake', h.shown()?.id === 'print-watch'
    && h.shown()?.text === 'PRINTING THE COLONISTS · 0/12 — [TAB] to watch them wake', h.shown()?.text);
  h.press('Tab');
  h.stepFor(0.5);
  check('in blue PRINT FAST is offered on the strip (◇, lights the button)', h.shown()?.id === 'print-fast-offer' && h.shown()?.highlight === 'print-fast',
    JSON.stringify(h.shown()));
  const startWall = h.wall();
  check('PRINT FAST is accepted while printing', setPrintFast(h.store, true) === null);
  h.stepUntil(() => h.store.getState().run.phase !== 'printing', 60);
  const last = printed().at(-1)!.wall - startWall;
  check('PRINT FAST: the interval ×0.25 (12 clusters in about 7.5 s)', printed().length === 12 && Math.abs(last - 7.5) <= 0.5 + 0.5, `${last.toFixed(2)} s`);
  check('the interval formula: base / max(range, 0.5) / speed, ×0.25 fast, ∞ without a printer', printIntervalSec(2.5, 1, 1, false) === 2.5
    && printIntervalSec(2.5, 0.2, 1, false) === 5 && printIntervalSec(2.5, 1, 0.5, false) === 5 && printIntervalSec(2.5, 1, 1, true) === 0.625
    && printIntervalSec(2.5, 1, 0, false) === Infinity);
}
{
  fresh();
  h.startPrinting(1);
  check('PRINT NEXT C12: accepted', setPrintNext(h.store, 'C12') === null && h.store.getState().printer.printNext === 'C12');
  h.stepUntil(() => printed().length === 1, 10);
  check('PRINT NEXT: C12 prints first, then the pin clears', printed()[0]?.cluster === 'C12' && h.store.getState().printer.printNext === null);
  check('PRINT NEXT twice on the same cluster takes it back out', setPrintNext(h.store, 'C05') === null && setPrintNext(h.store, 'C05') === null
    && h.store.getState().printer.printNext === null);
  // PRINT NEXT on a cluster that can't print right now (here: infected) is skipped, and stays pinned.
  setPrintNext(h.store, 'C07');
  h.soul('C07').infected = { side: 'left' };
  h.stepUntil(() => printed().length === 2, 10);
  check('PRINT NEXT on a cluster that becomes infected: skipped, the pin is kept', printed()[1]?.cluster === 'C01'
    && h.store.getState().printer.printNext === 'C07');
  delete h.soul('C07').infected;
  h.stepUntil(() => printed().length === 3, 10);
  check('…cured: it prints next', printed()[2]?.cluster === 'C07');
}

// --- Edge cases ---------------------------------------------------------------------------------------
{
  // Moving a cluster mid-print: skipped while transferring, printed once it lands.
  fresh();
  installTool(h.store, 'move');
  h.startPrinting(1);
  const c01 = h.soul('C01');
  const bigFree = h.store.getState().memory.filter((seg) => seg.type === 'free').sort((a, b) => b.size - a.size)[0]!;
  const moved = actionMove(h.store, c01, { regionSegIds: [bigFree.id], col: 0 });
  // The jump keeps C01's source in memory until the clone is written: two segments, one cluster.
  const during = h.store.getState();
  const copies = during.memory.filter((seg) => seg.type === 'soul' && seg.cluster === 'C01').length;
  const counts = [soulCounts(during).inMemory, printStatus(during).total, intactTally(during).clusters,
    lineVars(during, getPrediction()).clustersTotal, memStatsModel(during).souls.value, memStatsModel(during).souls.small];
  check('moving C01 (two copies in memory): every count sees one cluster (2,400 souls, 12 clusters)', copies === 2
    && soulsInMemory(during).length === 12 && counts.join() === '2400,12,12,12,2,400,12 clusters', `${copies} copies: ${counts.join(' | ')}`);
  h.stepUntil(() => printed().length === 1, 10);
  check('moving C01: the move started, C01 is not printable, C02 prints first', moved === null && printed()[0]?.cluster === 'C02');
  h.runOps();
  check('…landed past the root: C01 keeps its code and is printable again', h.soul('C01').id === c01.id && isPrintable(h.soul('C01')));
  h.stepUntil(() => h.store.getState().run.phase !== 'printing', 60);
  check('…and prints in its new place in the line (now the highest address: last)', printed().at(-1)?.cluster === 'C01' && printed().length === 12,
    printed().map((print) => print.cluster).join());
}
{
  // A repair on a cluster is never outrun by the printer (repairing clusters are skipped), and a
  // print that does land on one (here forced) aborts the repair: what is printed is gone, and the
  // charge already paid stays spent.
  fresh(1, false);
  h.press('Tab');
  h.step();
  h.startPrinting(1);
  const c09 = h.soul('C09');
  const chargeBefore = chargeLeft(h.store.getState());
  check('REPAIR on C09 (71%) starts while printing', actionRepair(h.store, c09) === null && !isPrintable(c09));
  h.stepFor(0.6);
  const repairOps = getOps().filter((operation) => operation.kind === 'repair');
  printCluster(h.store, c09, 1);
  check('a print on a repairing cluster aborts the repair', repairOps.length === 1 && getOps().length === 0
    && !h.store.getState().memory.includes(c09));
  check('…and keeps the charge spent so far (no refund)', chargeLeft(h.store.getState()) < chargeBefore, `${chargeBefore} → ${chargeLeft(h.store.getState())}`);
}
{
  // Repaired in time: the repair wins, C09 then prints intact.
  fresh(1, false);
  h.press('Tab');
  h.step();
  h.startPrinting(1);
  actionRepair(h.store, h.soul('C09'));
  h.stepUntil(() => h.store.getState().run.phase !== 'printing', 60);
  check('C09 repaired while printing: it waits for the repair, then wakes intact (2,400 woke)', printed().find((print) => print.cluster === 'C09')?.outcome === 'woke'
    && soulCounts(h.store.getState()).intact === 2400);
}
{
  // Paused: look-only. Nothing prints, PRINT FAST and PRINT NEXT are refused.
  fresh();
  h.startPrinting(1);
  h.press('KeyP');
  h.stepFor(5);
  check('paused: nothing prints for 5 s', printed().length === 0 && h.store.getState().clock.paused);
  check('paused: PRINT FAST and PRINT NEXT are refused', setPrintFast(h.store, true) === 'PAUSED' && setPrintNext(h.store, 'C03') === 'PAUSED');
  h.press('KeyP');
  check('P resumes printing (the ship is live while printing)', !h.store.getState().clock.paused);
  h.stepUntil(() => printed().length === 1, 10);
  check('…and the first print comes 2.5 s later', printed().length === 1);
}
{
  // An ACCEPT below STRANDED_RANGE_FRAC strands the ship (§4.3): through the real ACCEPT ORBIT, on a
  // closed loop with 5% of it in the ring and FUEL below what the fix needs, so ACCEPT is offered.
  fresh();
  const level = h.store.getState().level;
  const { rp, ra } = orbitForRange(level.ring, 0.05);
  const orbit = stateFromElements(rp, (ra - rp) / (ra + rp), 0, 0, level.planet.mu);
  h.store.update((d) => { d.orbit = { x: orbit.x, y: orbit.y, vx: orbit.vx, vy: orbit.vy }; d.burn.fuelPct = 1; });
  h.stepFor(0.5);
  const range = getPrediction().greenFraction;
  const refusal = acceptOrbit(h.store);
  h.stepFor(5);
  const state = h.store.getState();
  check(`ACCEPT at ${Math.round(range * 100)}% range (< ${STRANDED_RANGE_FRAC * 100}%): stranded, no printing, the clock stopped`, refusal === null
    && range < STRANDED_RANGE_FRAC && state.burn.status === 'stranded' && state.run.phase === 'flight' && state.clock.paused
    && printed().length === 0, `${refusal} · ${state.burn.status} · ${state.run.phase} · paused ${state.clock.paused}`);
}

finish();
