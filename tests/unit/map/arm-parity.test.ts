// Track RETIRE (slice-4cde-plan §9): retiring the classic world changes nothing on the arm. Run 1's arm on seed 7 is pinned
// three ways, each to the digest it had at baffe52 (before the retirement's first commit):
// • every one of its 20 ShipDefs (data/ships.ts shipDefOf on map/run1-fixture's run1Map(7)), the authored five included,
//   whose landing, arrival damage, pod racks and lead pod were read from the classic five until phase 1;
// • every ship's built world past ARES-VII as the beam from it would build it (support/residents armShipSlices(7, slot));
// • run 1 played: RUN START on seed 7 (systems/run.ts startRun on the arm), the worked route flown by wp11's strip-following
//   kid with its defenders as map/run1-route flies it (every landing instant but the final ship's, the finale's choice by
//   the charge), the state hashed at every boot, every ship's end and every desk.
// A digest that moves is a visible change on the arm: find it, never re-record it here.
import { createHash } from 'node:crypto';
import type { GameState } from '@state/schema';
import { check, finish } from '../wp1/harness';
import { createHarness11 } from '../wp11/harness11';
import { followDirector } from '../wp2/harness2';
import { receiveTransmission } from '@systems/boot';
import { shipLost, startRun, continueAfterReport, continueAfterLoss } from '@systems/run';
import { setCourseFromDesk } from '../support/desk';
import { autoburnAvailable } from '@systems/autoburn';
import { getPrediction } from '@systems/predict';
import { pickChoice } from '@systems/say';
import { DEAL_REFUSE } from '@systems/hollow-deal';
import { chargeLeft, getByRole } from '@state/selectors';
import { actionRepair } from '@state/actions';
import { getOpsBySeg } from '@systems/ops-core';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { setLandingMode } from '../support/landing-instant';
import { followLanding } from '../landing/harness-landing';
import { setRequest } from '@systems/repository';
import { shipDefOf } from '@data/ships';
import { armShipAt } from '@systems/map-run';
import { MERGE_COST_CHARGE } from '@data/tuning';
import { chooseEnding, finaleAtStep1 } from '../support/finale';
import { armShipSlices } from '../support/residents';
import { run1Map, WORKED_ROUTE } from './run1-fixture';
import type { RepoFileId } from '@/types/repo';

const SEED = 7;
// Generated ids (`free~12`) count from module load: the order of imports must not move a digest.
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value).replace(/~\d+/g, '~#')).digest('hex').slice(0, 16);

// --- The 20 ShipDefs and their built worlds -------------------------------------------------------------------------------
const PINNED_DEFS = 'c9973645e1b66ad4';
// Playtest 1 B-ORDER re-recorded it (it was ba4e29c778f55abd): the link went (note 20), and with the link field put back
// on every hop (Hop.linkBlocks, round((1460 − 11·d) / 10)) the slices hash to ba4e29c778f55abd again: nothing else moved.
const PINNED_SLICES = '35d48499b88bf89a';
const map = run1Map(SEED);
const defs = map.arm.map((_, slot) => shipDefOf(armShipAt(map, slot)));
const defsNow = digest(defs);
const slicesNow = digest(map.arm.slice(1).map((_, i) => armShipSlices(SEED, i + 1)));
console.log(`INFO  seed ${SEED}: defs ${defsNow} · slices ${slicesNow}`);
check(`run 1's arm, seed ${SEED}: its 20 ShipDefs are as they were before the retirement`, defsNow === PINNED_DEFS, `${defsNow} ≠ ${PINNED_DEFS}`);
check(`…and every ship's built world past ARES-VII (its ship slices from a beam off it)`, slicesNow === PINNED_SLICES, `${slicesNow} ≠ ${PINNED_SLICES}`);

// --- Run 1 played ---------------------------------------------------------------------------------------------------------
// Slice 8 ENDINGS re-recorded this one digest (it was de4d1e6da04d568e), and found what moved it: MERGE_COST_CHARGE 20 → 16
// (OPEN-DECISIONS 108) changes HOLLOW's `> keep 16 charge for me, 047.` line, said one hop from the final ship. The first
// moment that moves is CORMORANT's desk, every ship's outcome and the run's end (won-purge) are as before, and an A/B copy
// of src/ at 20 (tests/unit/balance/ab.mjs) still gives de4d1e6da04d568e.
// Playtest 1 B-ORDER re-recorded it again (it was 8ceb50b18060dcb5): the link went (note 20), so every block of charge
// crosses. The first moment that moves is KESTREL's boot (HALCYON → KESTREL's link, 117, held charge back); the moments
// before it are the same digests, every ship's outcome is as before, and the run's end is won-merge, not won-purge: the
// unit reaches LAST LIGHT with the 16 that MERGE costs (plan §3.3.4's expected effect; the lead re-reads the balance).
const PINNED_RUN = 'ab2fecc0c09560be';
const REQUESTS: readonly (RepoFileId | null)[] = ['mv', 'rm', 'swap', 'cp', null];
const h = createHarness11(1, { soulsFound: false });
const state = (): Readonly<GameState> => h.store.getState();
const SAVER = { coreHealBelow: 50, coreHealTo: 60 };
const trail: string[] = [];
// What a moment of the run is: everything the store holds but the UI's own slices (the page's, not the game's).
const record = (event: string): void => {
  const { ui, ...game } = state() as GameState & { ui: unknown };
  void ui;
  trail.push(`${event}@${state().level.shipName}:${digest(game)}`);
};

function flyShip(): void {
  followDirector(h, {
    reactionSec: 0.4,
    maxWall: 1500,
    mistake: () => {
      h.defend11(SAVER);
      const shown = state().director.shown?.id ?? '';
      const thrust = getByRole(state(), 'thrust-ctrl');
      if ((shown === 'tut-ghost-noswap' || shown === 'tut-ghost-noswap-tab') && thrust !== null && getOpsBySeg(thrust.id).length === 0 && !state().clock.paused) {
        actionRepair(h.store, thrust);
      }
      const deal = state().hollow.deal;
      if (deal.phase === 'offered' && deal.entryId !== null) pickChoice(deal.entryId, DEAL_REFUSE);
      if (state().burn.auto.phase === 'idle' && autoburnAvailable(state(), getPrediction())) h.press('KeyB');
      return false;
    },
  });
}

h.newRun(SEED);
startRun(h.store, SEED, FIRST_RUN_LINEAGE);
receiveTransmission(h.store);
h.stepUntil(() => state().run.phase === 'flight', 15);
record('boot');
const route = WORKED_ROUTE;
let guard = 0;
while (state().run.phase !== 'end' && guard++ < 16) {
  if (state().run.phase === 'boot') { h.stepUntil(() => state().run.phase !== 'boot', 25); record('boot'); }
  const final = state().run.map.route.at(-1)!.slot === route[route.length - 1];
  setLandingMode(final ? 'manual' : 'instant');
  if (state().run.phase === 'flight' && state().burn.status === 'approaching' && !state().run.coreLost) flyShip();
  record('flown');
  if (shipLost(state())) continueAfterLoss(h.store);
  else if (state().run.phase === 'landing') {
    if (final) {
      let picked = false;
      followLanding(h, {
        maxWall: 900,
        onTick: () => {
          h.defend11(SAVER);
          if (picked || !finaleAtStep1(state())) return;
          picked = true;
          chooseEnding(h.store, chargeLeft(state()) >= MERGE_COST_CHARGE ? 'merge' : 'purge');
        },
      });
    }
    const end = h.wall() + 600;
    while (state().run.phase === 'landing' && !state().run.coreLost && h.wall() < end) { h.defend11(SAVER); h.step(); }
    if (state().run.phase === 'report') continueAfterReport(h.store);
    else if (shipLost(state())) continueAfterLoss(h.store);
  } else if (state().run.phase === 'report') continueAfterReport(h.store);
  if (state().run.phase === 'desk') {
    record('desk');
    const next = route[state().run.shipIndex + 1];
    if (next === undefined) break;
    const ask = REQUESTS[state().run.shipIndex] ?? null;
    if (ask !== null) setRequest(h.store, ask);
    setCourseFromDesk(h.store, next);
    h.transmit();
    h.stepUntil(() => state().run.phase === 'flight', 25);
    record('boot');
  }
}
record('end');
const runNow = digest(trail);
console.log(`INFO  seed ${SEED} run 1: ${state().run.endCause} · ${state().run.ships.map((ship) => `${ship.shipName}:${ship.outcome}`).join(' ')}`);
console.log(`INFO  ${trail.join(' ')}`);
check(`run 1 on seed ${SEED}, the worked route flown by the strip-following kid, plays exactly as before the retirement (${trail.length} moments)`,
  runNow === PINNED_RUN, `${runNow} ≠ ${PINNED_RUN}`);
finish();
