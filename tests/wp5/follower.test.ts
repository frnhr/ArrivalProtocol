// WP5 acceptance 5: the WP1 literal follower (it obeys the flight table and nothing else: no TAB, no
// SCAN, no repair) flies run 1's ship 1 with the archive sealed: SKIP stays held for the colonists,
// it still locks, the printer finds the colonists by itself, and printing runs through to the WAKE
// REPORT phase with all 12 clusters printed. A second kid also follows the reveal and the triage
// (TAB, SCAN STASIS, REPAIR C09) and wakes everyone intact.
import { check, finish, followStrip } from '../wp1/harness';
import { createHarness5 } from './harness5';
import { SKIP_REFUSAL_COLONISTS } from '@systems/pace';
import { soulCounts, getByRole } from '@state/selectors';
import { actionScan, actionRepair } from '@state/actions';
import { setPrintFast } from '@systems/printer';
import { installTool } from '@systems/licences';

const h = createHarness5(1);

{
  h.resetTo('flight');
  let skipRefusals = 0;
  const offRefused = h.events.length;
  followStrip(h, 0.4, 400, () => undefined);
  const refusedSkips = h.events.slice(offRefused).filter((event) => event.name === 'refused'
    && (event.payload as { reason: string }).reason === SKIP_REFUSAL_COLONISTS).length;
  skipRefusals = refusedSkips;
  check('the follower locks (archive sealed the whole flight)', h.status() === 'locked', `${h.status()} at ${h.wall().toFixed(1)} s`);
  // LEAD-1: the strip offers [F] SKIP again, sealed, once the colonists ask has stood SOULS_ASK_HOLD_SEC;
  // what still holds is that the follower never pressed F into a refusal (CHECK THE COLONISTS FIRST).
  check('the follower never had a SKIP refused (the strip offers [F] SKIP only once the hold is released)', skipRefusals === 0
    && !h.events.some((event) => event.name === 'refused'));
  const lockedAt = h.wall();
  h.stepUntil(() => h.store.getState().run.phase === 'report', 200);
  const state = h.store.getState();
  const counts = soulCounts(state);
  check('printing runs through to the WAKE REPORT phase', state.run.phase === 'report', `${state.run.phase} after ${(h.wall() - lockedAt).toFixed(1)} s`);
  check('12 clusters printed', state.souls.results.length === 12 && h.souls().length === 0, `${state.souls.results.length}`);
  check('the printer found them (cause printing) before the first print', state.souls.reveal.cause === 'printing');
  // WP7 fix round 1: SoulCounts counts heads in `heads`; the intact ones are `intact` (was `woke`), and the
  // half-credit `score` is RUN END's runScore only.
  check('C09 never repaired: 2,200 woke intact, 200 with missing memories', counts.intact === 2200 && counts.wokeWithGaps === 200,
    JSON.stringify(counts));
  console.log(`      locked at ${lockedAt.toFixed(1)} s, report at ${h.wall().toFixed(1)} s`);
}

{
  // The kid who also does what the mind asks, from the ship screen (the actions themselves; the
  // tutorial's TAB, chip and click are covered in reveal.test.ts): on the coast SCAN STASIS, then
  // REPAIR C09 once it is known to be hurt; PRINT FAST once printing.
  h.resetTo('flight');
  let scanned = false;
  let repaired = false;
  followStrip(h, 0.4, 400, () => {
    const state = h.store.getState();
    const line = state.director.shown;
    if (!scanned && line?.id === 'tut-check-souls') scanned = actionScan(h.store, getByRole(state, 'stasis')!) === null;
    if (scanned && !repaired && line?.id === 'tut-hurt-cluster-tab') {
      if (!state.run.licences.includes('repair')) installTool(h.store, 'repair');
      repaired = actionRepair(h.store, h.soul('C09')) === null;
    }
  });
  check('the reveal-and-triage kid locks too', h.status() === 'locked', `${h.status()} at ${h.wall().toFixed(1)} s`);
  check('…having scanned STASIS (the reveal by scan) and repaired C09 on the coast', scanned && repaired
    && h.store.getState().souls.reveal.cause === 'scan' && h.soul('C09').integrity === 100);
  h.step();
  setPrintFast(h.store, true);
  const lockedAt = h.wall();
  h.stepUntil(() => h.store.getState().run.phase === 'report', 200);
  const counts = soulCounts(h.store.getState());
  check('…and wakes all 2,400 intact, PRINT FAST in about 7.5 s', counts.intact === 2400 && counts.heads === 2400
    && h.wall() - lockedAt < 7.5 + 2.5, `${JSON.stringify(counts)} in ${(h.wall() - lockedAt).toFixed(1)} s`);
}

finish();
