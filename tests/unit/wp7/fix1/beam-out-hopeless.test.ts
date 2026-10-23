// WP7 fix round 1: BEAM OUT's "hopeless" verdict (the strip's line above every rule) is about the ship,
// not about this tick's thrust caps.
// • A ship on an impact course far from the ground, with the tank to lift ▼, while the kid REPAIRs Engine
//   I/O (offline: thrust cap 0): before the fix the lift read Infinity, the ship read doomed and hopeless,
//   and `NOT ENOUGH FUEL … press BEAM OUT` buried F2's repair line. Now BEAM OUT stays hidden and F2 leads.
// • The strip's reason is the true one: an empty tank says NOT ENOUGH FUEL; a full tank in a dive too
//   steep for any burn says TOO LATE; no driver file at all says THE ENGINE CAN'T FIRE.
import { check, finish } from '../../wp1/harness';
import { createHarness7 } from '../harness7';
import { beamOutView, impactInTac, hopelessWhy } from '@systems/beam-out';
import { getPrediction } from '@systems/predict';
import { actionRepair } from '@state/actions';
import { getByRole, hasIntegrity } from '@state/selectors';
import { installTool } from '@systems/licences';
import { LINES } from '@data/script';
import { BEAM_OUT_OFFER_TAC, MAX_LINE_CHARS } from '@data/tuning';

const h = createHarness7(3);
const state = () => h.store.getState();
h.shipAlone(1, 3);

// HALCYON's own slip: the IN correction over-held until the path ends on the planet, Engine I/O degraded
// after the crossing (a repair a kid makes on the coast).
h.store.update((d) => {
  d.burn.sasMode = 'radial-in';
  d.burn.fuelPct = 100;
  const engine = d.memory.find((seg) => seg.role === 'engine-io');
  if (!engine || !hasIntegrity(engine)) throw new Error('no engine-io');
  engine.integrity = 70;
});
h.stepUntil(() => !state().burn.presetAligning, 10);
h.keyDown('Space');
h.stepUntil(() => getPrediction().outcome === 'impact', 120);
h.keyUp('Space');
h.step();
h.step();
const before = beamOutView(state(), getPrediction());
const impactTac = impactInTac(state(), getPrediction()) ?? 0;
check('an over-held IN: an impact course far from the ground, BEAM OUT hidden', getPrediction().outcome === 'impact'
  && impactTac > BEAM_OUT_OFFER_TAC && before.look === 'hidden', `${impactTac.toFixed(1)} tac s ${JSON.stringify(before)}`);

installTool(h.store, 'repair');
check('…REPAIR on Engine I/O starts', actionRepair(h.store, getByRole(state(), 'engine-io')!) === null);
h.step();
h.step();
h.step();
const during = beamOutView(state(), getPrediction());
check('…while it repairs (offline, no thrust): still not hopeless, still hidden', during.look === 'hidden'
  && hopelessWhy(state(), getPrediction()) === null, JSON.stringify(during));
h.stepFor(0.5);
check('…and the strip leads with F2, not BEAM OUT', !/BEAM OUT/.test(state().director.shown?.text ?? ''), state().director.shown?.text);

// The reasons. A steep dive close to the ground with a full tank: no burn lifts ▼ in time.
{
  h.shipAlone(1, 3);
  h.setIntegrity('engine-io', 100);
  const radius = state().level.planet.R + 300;
  h.store.mutate((d) => { d.burn.fuelPct = 100; d.orbit.x = radius; d.orbit.y = 0; d.orbit.vx = -3; d.orbit.vy = 0.05; });
  h.step();
  h.step();
  const view = beamOutView(state(), getPrediction());
  check('a full tank in a dive too steep for any burn: TOO LATE', view.look === 'offered' && view.hopeless === 'too-late', JSON.stringify(view));
  h.stepFor(0.3);
  check('…the strip says TOO LATE, not NOT ENOUGH FUEL', state().director.shown?.text === LINES.beamOutOffer('too-late'), state().director.shown?.text);
  h.store.mutate((d) => { d.burn.fuelPct = 0; });
  h.step();
  check('…the same dive with an empty tank: NOT ENOUGH FUEL', beamOutView(state(), getPrediction()).look === 'offered'
    && hopelessWhy(state(), getPrediction()) === 'fuel', String(hopelessWhy(state(), getPrediction())));
}
{
  h.shipAlone(1, 3);
  const radius = state().level.planet.R + 1500;
  h.store.update((d) => {
    d.memory = d.memory.map((seg) => (seg.role === 'engine-io' ? { id: `free-${seg.id}`, name: 'Free', type: 'free', size: seg.size } : seg));
    d.ui.memoryRev++;
  });
  h.store.mutate((d) => { d.burn.fuelPct = 100; d.orbit.x = radius; d.orbit.y = 0; d.orbit.vx = -0.5; d.orbit.vy = 0.3; });
  h.step();
  h.step();
  check('no engine driver at all on an impact course: THE ENGINE CAN\'T FIRE', hopelessWhy(state(), getPrediction()) === 'no-engine',
    String(hopelessWhy(state(), getPrediction())));
}
// WP12 fix round 2: with the MIND's `[TAB]` wording of each.
const lines = (['fuel', 'too-late', 'no-engine'] as const).flatMap((why) => [LINES.beamOutOffer(why), LINES.beamOutOfferTab(why)]);
check('every BEAM OUT reason line fits the strip (≤ 70)', lines.every((line) => line.length <= MAX_LINE_CHARS), lines.join(' | '));

finish();
