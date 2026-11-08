// WP7 fix round 1, the blocker: a unit that spent its last point of REPAIR CHARGE (actions.ts
// retireEmptyCharge frees the pool's blocks) must still cross. Before the fix, layoutCarried asked
// chargeSegment for the arrival's charge with no pool file and TRANSMIT ▸ threw at full white, leaving a
// white page. Now the floor (12) plus the star credit arrive in a fresh REPAIR CHARGE file.
// • the layout itself: no pool packed → a fresh pool holding exactly the arrival charge;
// • the EMERGENCY path: the pool spent by a real repair, a crash, EMERGENCY TRANSMIT → HALCYON boots with 12;
// • the CONTINUE path: ship 1 flown to its WAKE REPORT with the pool spent → HALCYON with max(12, 6·★).
import '../../support/classic-world';
import { check, finish } from '../../wp1/harness';
import { createHarness7 } from '../harness7';
import { continueAfterLoss, continueAfterReport } from '../../support/classic-flow';
import { packUnit, layoutCarried, arrivalCharge } from '@systems/carry';
import { receiveTransmission } from '@systems/boot';
import { installTool } from '@systems/licences';
import { shipStars } from '@systems/stars';
import { assertMemoryInvariants } from '@systems/memory-ops';
import { actionRepair } from '@state/actions';
import { chargeLeft, getByRole, getRedundancy } from '@state/selectors';
import { transmitModel } from '@systems/transmit';
import { CHARGE_ARRIVAL_FLOOR, STAR_CHARGE_BONUS } from '@data/tuning';
import { classicShip, CLASSIC_HOPS } from '@data/classic-five';
import { nominalShipThreat } from '@systems/threat-plan';
import { MEMORY_LAYOUTS } from '@data/memory';

const h = createHarness7(5, { soulsFound: false });
const state = () => h.store.getState();
const halcyon = classicShip(1);

// Spends the pool for real: one point left, a REPAIR on a hurt file, the op ends with NO CHARGE and the
// pool's blocks become free space.
function spendAllCharge(): void {
  installTool(h.store, 'repair');
  h.setIntegrity('telemetry', 40);
  h.store.update((d) => {
    const charge = d.memory.find((seg) => seg.type === 'redundancy');
    if (!charge || charge.type !== 'redundancy') throw new Error('no REPAIR CHARGE to spend');
    charge.used = 1;
  });
  const refusal = actionRepair(h.store, getByRole(state(), 'telemetry')!);
  if (refusal !== null) throw new Error(`the repair was refused: ${String(refusal)}`);
  h.stepUntil(() => getRedundancy(state()) === undefined, 20);
}

const memoryValid = (): boolean => {
  try { assertMemoryInvariants(state().memory, MEMORY_LAYOUTS.FULL.totalBlocks); return true; } catch { return false; }
};

// --- The layout on its own --------------------------------------------------------------------------
{
  h.newRun(5);
  h.store.update((d) => { d.run.phase = 'flight'; d.run.simulationRetryUsed = true; });
  spendAllCharge();
  check('the pool is gone from memory once its last point is spent', getRedundancy(state()) === undefined);
  const packet = packUnit(state().memory, CLASSIC_HOPS[halcyon.slot]!.linkBlocks, []);
  check('…the packet carries no pool (charge null, 0 carried)', packet.charge === null && packet.chargeCarried === 0);
  const blocks = arrivalCharge(packet.chargeCarried, STAR_CHARGE_BONUS).blocks;
  let layoutError = '';
  let pool: ReturnType<typeof getRedundancy> | null = null;
  try {
    const layout = layoutCarried(packet, blocks, halcyon, nominalShipThreat(1));
    const found = layout.racks.segs.find((seg) => seg.type === 'redundancy');
    pool = found && found.type === 'redundancy' ? found : null;
  } catch (error) { layoutError = (error as Error).message; }
  check('layoutCarried with no pool packed lays out a fresh REPAIR CHARGE (no throw)', layoutError === '' && pool !== null, layoutError);
  check('…holding exactly the arrival charge, a full pool, as REPAIR CHARGE',
    pool !== null && pool.used === blocks && pool.size === blocks && pool.capacity >= blocks && pool.role === 'redundancy' && pool.name === 'Repair Charge',
    JSON.stringify(pool));
  check('…under an id of its own (not the fresh unit\'s written id)', pool !== null && pool.id !== 'redund', pool?.id);
}

// --- EMERGENCY TRANSMIT with the pool spent ----------------------------------------------------------
{
  h.newRun(5);
  h.store.update((d) => { d.run.phase = 'flight'; d.run.simulationRetryUsed = true; });
  spendAllCharge();
  const radius = state().level.planet.R + 20;
  h.store.mutate((d) => { d.orbit.x = radius; d.orbit.y = 0; d.orbit.vx = -3; d.orbit.vy = 0.05; d.ui.mode = 'tools'; });
  h.stepUntil(() => h.status() !== 'approaching', 10);
  check('the ship crashed with the pool spent', h.status() === 'crashed' && getRedundancy(state()) === undefined, h.status());
  continueAfterLoss(h.store);
  check('…EMERGENCY TRANSMIT opens the TRANSMIT screen', state().run.phase === 'transmit', state().run.phase);
  const model = transmitModel(state());
  check('…which promises the floor', model.arrivalCharge === CHARGE_ARRIVAL_FLOOR, model.arrivalLine);
  let error = '';
  try { h.transmit(); } catch (thrown) { error = (thrown as Error).message; }
  check('TRANSMIT ▸ with no charge left does not throw', error === '', error);
  check('…HALCYON boots with the promised REPAIR CHARGE (12)', state().run.phase === 'boot' && state().run.shipIndex === 1
    && chargeLeft(state()) === CHARGE_ARRIVAL_FLOOR, `${state().run.phase} ship ${state().run.shipIndex} charge ${chargeLeft(state())}`);
  check('…memory is 384 blocks and valid', memoryValid());
  check('…the boot\'s charge line says the floor', state().run.arrival?.chargeFloorAdded === CHARGE_ARRIVAL_FLOOR, JSON.stringify(state().run.arrival));
}

// --- CONTINUE from ship 1's WAKE REPORT with the pool spent ------------------------------------------
{
  h.newRun(7);
  receiveTransmission(h.store);
  h.stepUntil(() => state().run.phase === 'flight', 15);
  spendAllCharge();
  check('ship 1 flies on with its pool spent', getRedundancy(state()) === undefined && state().run.phase === 'flight');
  h.flyDefending(600);
  const printed = h.untilPhase('report', 300);
  check('…and still reaches its WAKE REPORT', printed, `${h.status()} ${state().run.phase}`);
  if (printed) {
    const earned = shipStars(state()).filter((star) => star.earned).length;
    continueAfterReport(h.store);
    check('CONTINUE → TRANSMIT', state().run.phase === 'transmit', state().run.phase);
    let error = '';
    try { h.transmit(); } catch (thrown) { error = (thrown as Error).message; }
    // WP8: the card picked at the send (harness7.transmit takes the first) can be +12 REPAIR CHARGE; a unit with
    // no charge left is offered it first (×2). It arrives with the star credit, before the floor.
    const cardCharge = state().run.arrival?.cardCharge ?? 0;
    const expected = Math.max(CHARGE_ARRIVAL_FLOOR, STAR_CHARGE_BONUS * earned + cardCharge);
    check('TRANSMIT ▸ does not throw, and HALCYON boots with max(12, 6·★ + the card)', error === '' && state().run.shipIndex === 1
      && chargeLeft(state()) === expected, `${error} charge ${chargeLeft(state())} (★ ${earned}, card ${cardCharge}, expected ${expected})`);
    check('…memory is 384 blocks and valid', memoryValid());
  }
}

finish();
